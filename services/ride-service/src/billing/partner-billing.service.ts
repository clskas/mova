import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
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
