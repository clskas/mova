import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import {
  fetchPartnerWallet,
  filterPartnerTransactions,
  sumTransactionAmounts,
} from '../common/partner-wallet.util';
import { PrismaService } from '../prisma/prisma.service';
import { HistoryService, HistoryType } from '../history/history.service';
import { receiptNumberFrom, SERVICE_TYPE_LABELS } from './billing-labels.util';
import { buildReceiptPdf } from './billing-pdf.util';
import { MovaReceipt, ReceiptLine } from './billing.types';

const RECEIPT_ELIGIBLE: Partial<Record<HistoryType, (status: string, item: { isPaid?: boolean }) => boolean>> = {
  RIDE: (s, i) => s === 'COMPLETED' && i.isPaid === true,
  PARCEL: (s) => s === 'DELIVERED',
  FOOD: (s) => s === 'DELIVERED',
  EXPRESS: (s) => s === 'DELIVERED',
  ERRAND: (s) => s === 'COMPLETED',
  MOVING: (s, i) => s === 'COMPLETED' && (i.isPaid === true || i.isPaid === undefined),
  RENTAL: (s) => ['CONFIRMED', 'IN_PROGRESS', 'RETURNED', 'PAID', 'CLOSED'].includes(s),
  SCHEDULED: (s) => s === 'COMPLETED',
  CARPOOL: (s) => s === 'COMPLETED',
};

function historyToBillingType(type: HistoryType): string {
  if (type === 'PARCEL' || type === 'FOOD' || type === 'EXPRESS') return 'DELIVERY';
  return type;
}

@Injectable()
export class PartnerBillingService {
  constructor(private prisma: PrismaService) {}

  private async assertRestaurantOrder(ownerUserId: string, deliveryId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({ where: { ownerUserId } });
    if (!restaurant) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Restaurant introuvable.');
    }
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { restaurant: true },
    });
    if (!delivery || delivery.type !== DeliveryType.FOOD) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const owns =
      delivery.restaurantId === restaurant.id ||
      (Array.isArray(delivery.items) &&
        (delivery.items as { restaurantId?: string }[]).some((it) => it?.restaurantId === restaurant.id));
    if (!owns) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (delivery.status !== DeliveryStatus.DELIVERED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Reçu disponible après livraison.');
    }
    return { delivery, restaurant };
  }

  private async assertRentalBooking(ownerUserId: string, inquiryId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({
      where: { id: inquiryId },
      include: { vehicle: true },
    });
    if (!inquiry?.vehicle || inquiry.vehicle.ownerUserId !== ownerUserId) {
      throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (!['CONFIRMED', 'IN_PROGRESS', 'RETURNED', 'CLOSED'].includes(inquiry.status)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Document disponible après confirmation.');
    }
    return inquiry;
  }

  async buildRestaurantOrderReceipt(ownerUserId: string, deliveryId: string): Promise<MovaReceipt> {
    const { delivery, restaurant } = await this.assertRestaurantOrder(ownerUserId, deliveryId);
    const passenger = await fetchAuthUserBrief(delivery.userId);
    const total = delivery.finalPriceCdf ?? delivery.estimatedPriceCdf;
    const commissionCdf = Math.round(total * 0.15);
    const netCdf = total - commissionCdf;
    const lines: ReceiptLine[] = [
      { label: `Commande #${delivery.id.slice(0, 8)}`, amountCdf: total, kind: 'item' },
      { label: 'Commission MOVA (15 %)', amountCdf: commissionCdf, kind: 'fee' },
      { label: 'Net partenaire', amountCdf: netCdf, kind: 'total' },
    ];
    return {
      receiptNumber: receiptNumberFrom('DELIVERY', deliveryId),
      documentType: 'RECEIPT',
      issuedAt: new Date().toISOString(),
      referenceType: 'DELIVERY',
      referenceId: deliveryId,
      serviceLabel: `Commande ${restaurant.name}`,
      serviceTypeLabel: 'Reçu partenaire restaurant',
      customer: { name: restaurant.name, phone: passenger?.phone },
      lines,
      subtotalCdf: total,
      discountCdf: delivery.discountCdf ?? 0,
      totalCdf: netCdf,
      currency: 'CDF',
      promoCode: delivery.promoCode,
      payment: null,
      footerNote: 'Document partenaire MOVA — montant net crédité sur votre solde.',
    };
  }

  async buildRentalPartnerReceipt(ownerUserId: string, inquiryId: string): Promise<MovaReceipt> {
    const inquiry = await this.assertRentalBooking(ownerUserId, inquiryId);
    const passenger = await fetchAuthUserBrief(inquiry.userId);
    const total = inquiry.totalCdf ?? inquiry.estimatedPriceCdf ?? 0;
    const commissionCdf = Math.round(total * 0.12);
    const netCdf = total - commissionCdf;
    const lines: ReceiptLine[] = [
      { label: inquiry.vehicle?.name ?? 'Location véhicule', amountCdf: total, kind: 'item' },
      { label: 'Commission MOVA (12 %)', amountCdf: commissionCdf, kind: 'fee' },
      { label: 'Net partenaire', amountCdf: netCdf, kind: 'total' },
    ];
    return {
      receiptNumber: receiptNumberFrom('RENTAL', inquiryId),
      documentType: 'RECEIPT',
      issuedAt: new Date().toISOString(),
      referenceType: 'RENTAL',
      referenceId: inquiryId,
      serviceLabel: `Réservation ${inquiry.vehicle?.name ?? inquiry.vehicleType}`,
      serviceTypeLabel: 'Reçu partenaire location',
      customer: { name: inquiry.vehicle?.ownerName ?? passenger?.name, phone: passenger?.phone },
      lines,
      subtotalCdf: total,
      discountCdf: inquiry.discountCdf ?? 0,
      totalCdf: netCdf,
      currency: 'CDF',
      promoCode: inquiry.promoCode,
      payment: null,
      footerNote: 'Document partenaire MOVA — location véhicule.',
    };
  }

  async getRestaurantPdf(ownerUserId: string, deliveryId: string) {
    const receipt = await this.buildRestaurantOrderReceipt(ownerUserId, deliveryId);
    const buffer = await buildReceiptPdf(receipt);
    return { receipt, buffer, filename: `${receipt.receiptNumber}-partner.pdf` };
  }

  async getRentalPdf(ownerUserId: string, inquiryId: string) {
    const receipt = await this.buildRentalPartnerReceipt(ownerUserId, inquiryId);
    const buffer = await buildReceiptPdf(receipt);
    return { receipt, buffer, filename: `${receipt.receiptNumber}-partner.pdf` };
  }

  private partnerTxPrefix(partnerType: 'restaurant' | 'rental') {
    return partnerType === 'restaurant' ? 'Vente repas' : 'Revenu location';
  }

  async getPartnerEarningsReport(
    ownerUserId: string,
    partnerType: 'restaurant' | 'rental',
    partnerName: string,
    query?: { from?: string; to?: string; q?: string; skip?: number; take?: number },
  ) {
    const wallet = await fetchPartnerWallet(ownerUserId);
    const prefix = this.partnerTxPrefix(partnerType);
    const from = query?.from ? new Date(query.from) : undefined;
    const to = query?.to ? new Date(query.to) : undefined;
    const filtered = filterPartnerTransactions(wallet.transactions, prefix, { from, to, q: query?.q });
    const skip = Math.max(query?.skip ?? 0, 0);
    const take = Math.min(Math.max(query?.take ?? 50, 1), 200);
    const page = filtered.slice(skip, skip + take);
    return {
      partnerType,
      partnerName,
      balanceCdf: wallet.balanceCdf,
      formattedBalance: wallet.formattedBalance,
      periodTotalCdf: sumTransactionAmounts(filtered),
      periodCount: filtered.length,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      data: page.map((tx) => ({
        id: tx.id,
        amountCdf: tx.amountCdf,
        description: tx.description,
        reference: tx.reference,
        createdAt: tx.createdAt,
      })),
      pagination: { skip, take, total: filtered.length },
    };
  }

  buildPartnerStatementCsv(
    partnerType: 'restaurant' | 'rental',
    partnerName: string,
    report: Awaited<ReturnType<PartnerBillingService['getPartnerEarningsReport']>>,
  ) {
    const label = partnerType === 'restaurant' ? 'Restaurant' : 'Partenaire location';
    const lines = [
      `MOVA — Rapport financier ${label}`,
      `Partenaire;${partnerName.replace(/;/g, ',')}`,
      `Généré;${new Date().toISOString()}`,
      report.from ? `Du;${report.from}` : '',
      report.to ? `Au;${report.to}` : '',
      '',
      `Solde actuel;${report.balanceCdf}`,
      `Total période;${report.periodTotalCdf}`,
      `Nombre d'opérations;${report.periodCount}`,
      '',
      'Date;Montant FC;Référence;Description',
      ...report.data.map((row) =>
        [
          row.createdAt,
          row.amountCdf,
          (row.reference ?? '').replace(/;/g, ','),
          (row.description ?? '').replace(/;/g, ','),
        ].join(';'),
      ),
    ];
    return lines.filter(Boolean).join('\n');
  }

  async getPartnerStatementPdf(
    ownerUserId: string,
    partnerType: 'restaurant' | 'rental',
    partnerName: string,
    query?: { from?: string; to?: string; q?: string },
  ) {
    const report = await this.getPartnerEarningsReport(ownerUserId, partnerType, partnerName, {
      ...query,
      skip: 0,
      take: 500,
    });
    const serviceLabel = partnerType === 'restaurant' ? 'Rapport revenus restaurant' : 'Rapport revenus location';
    const lines: ReceiptLine[] = [
      { label: 'Solde actuel', amountCdf: report.balanceCdf, kind: 'item' },
      { label: 'Total période filtrée', amountCdf: report.periodTotalCdf, kind: 'item' },
      { label: `Opérations (${report.periodCount})`, amountCdf: report.periodTotalCdf, kind: 'total' },
    ];
    const receipt: MovaReceipt = {
      receiptNumber: `MOVA-${partnerType.toUpperCase()}-${Date.now()}`,
      documentType: 'RECEIPT',
      issuedAt: new Date().toISOString(),
      referenceType: partnerType === 'restaurant' ? 'DELIVERY' : 'RENTAL',
      referenceId: ownerUserId,
      serviceLabel: partnerName,
      serviceTypeLabel: serviceLabel,
      customer: { name: partnerName },
      lines,
      subtotalCdf: report.periodTotalCdf,
      discountCdf: 0,
      totalCdf: report.periodTotalCdf,
      currency: 'CDF',
      payment: null,
      footerNote: `Détail : ${report.data.length} ligne(s) sur ${report.periodCount} dans la période.`,
    };
    const buffer = await buildReceiptPdf(receipt);
    return {
      report,
      buffer,
      filename: `mova-${partnerType}-rapport-${new Date().toISOString().slice(0, 10)}.pdf`,
    };
  }
}

@Injectable()
export class BillingHistoryService {
  constructor(private history: HistoryService) {}

  async listReceiptHistory(userId: string, limit = 30) {
    const take = Math.min(Math.max(limit, 1), 100);
    const { data } = await this.history.getUnifiedHistory(userId, undefined, take * 3);
    const items = data
      .filter((item) => {
        const check = RECEIPT_ELIGIBLE[item.type];
        return check ? check(item.status, item) : false;
      })
      .slice(0, take)
      .map((item) => {
        const billingType = historyToBillingType(item.type);
        return {
          referenceType: billingType,
          referenceId: item.id,
          historyType: item.type,
          title: item.title,
          amountCdf: item.priceCdf,
          status: item.status,
          createdAt: item.createdAt,
          receiptNumber: receiptNumberFrom(billingType, item.id),
          serviceTypeLabel: SERVICE_TYPE_LABELS[billingType] ?? billingType,
        };
      });
    return { data: items, currency: 'CDF' as const };
  }
}
