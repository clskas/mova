import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryType, RentalInquiryStatus } from '@prisma/client';
import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, serviceUrl } from '@mova/shared';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { PaymentInfoService } from '../internal/payment-info.service';
import { PrismaService } from '../prisma/prisma.service';
import { RideChatService } from '../chat/ride-chat.service';
import { ErrandChatService } from '../chat/errand-chat.service';
import { DeliveryChatService } from '../chat/delivery-chat.service';
import { RentalChatService } from '../chat/rental-chat.service';
import { PAYMENT_METHOD_LABELS, receiptNumberFrom, SERVICE_TYPE_LABELS } from './billing-labels.util';
import { buildEscPosBuffer, buildThermalReceiptText } from './billing-thermal.util';
import { buildReceiptPdf, buildThermalPdf } from './billing-pdf.util';
import { MovaReceipt, ReceiptLine, ReceiptPayment } from './billing.types';

type PaymentDetail = {
  method: string;
  status: string;
  amountCdf: number;
  providerRef?: string | null;
  paidAt?: string | null;
};

@Injectable()
export class BillingReceiptService {
  constructor(
    private prisma: PrismaService,
    private paymentInfo: PaymentInfoService,
    private rideChat: RideChatService,
    private errandChat: ErrandChatService,
    private deliveryChat: DeliveryChatService,
    private rentalChat: RentalChatService,
  ) {}

  private async fetchPaymentDetail(referenceType: string, referenceId: string): Promise<PaymentDetail | null> {
    try {
      const res = await fetch(
        serviceUrl('payment', `/internal/services/${referenceType}/${referenceId}/payment-detail`),
        { headers: { 'x-internal-api-key': INTERNAL_API_KEY } },
      );
      if (!res.ok) return null;
      return (await res.json()) as PaymentDetail;
    } catch {
      return null;
    }
  }

  private async fetchRidePaymentDetail(rideId: string): Promise<PaymentDetail | null> {
    try {
      const res = await fetch(serviceUrl('payment', `/internal/rides/${rideId}/payment-detail`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return (await res.json()) as PaymentDetail;
    } catch {
      return null;
    }
  }

  private async fetchUserEmail(userId: string): Promise<string | undefined> {
    try {
      const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return undefined;
      const user = (await res.json()) as { email?: string | null };
      return user.email?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private mapPayment(detail: PaymentDetail | null): ReceiptPayment | null {
    if (!detail) return null;
    return {
      method: detail.method,
      methodLabel: PAYMENT_METHOD_LABELS[detail.method] ?? detail.method,
      status: detail.status,
      amountCdf: detail.amountCdf,
      providerRef: detail.providerRef,
      paidAt: detail.paidAt,
    };
  }

  private async assertAccess(userId: string, referenceType: string, referenceId: string) {
    const info = await this.paymentInfo.getPaymentInfo(referenceType, referenceId);
    if (info.userId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN, 'Accès refusé à ce document.');
    }
    if (referenceType.toUpperCase() === 'RENTAL') {
      const allowed = new Set<string>([
        RentalInquiryStatus.RETURNED,
        RentalInquiryStatus.PAID,
        RentalInquiryStatus.CLOSED,
      ]);
      if (!allowed.has(info.status)) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          'Le reçu est disponible après restitution du véhicule.',
        );
      }
    }
    return info;
  }

  async buildReceipt(userId: string, referenceType: string, referenceId: string): Promise<MovaReceipt> {
    const type = referenceType.toUpperCase();
    const info = await this.assertAccess(userId, type, referenceId);
    const user = await fetchAuthUserBrief(info.userId);
    const email = await this.fetchUserEmail(info.userId);

    const payment =
      type === 'RIDE'
        ? this.mapPayment(await this.fetchRidePaymentDetail(referenceId))
        : this.mapPayment(await this.fetchPaymentDetail(type, referenceId));

    const paid = payment?.status === 'COMPLETED';
    const totalCdf = paid && payment ? payment.amountCdf : info.amountCdf;
    const lines = await this.buildLines(type, referenceId, totalCdf);
    const discountCdf = lines.filter((l) => l.kind === 'discount').reduce((s, l) => s + Math.abs(l.amountCdf), 0);
    const subtotalCdf = totalCdf + discountCdf;
    const promoCode = await this.resolvePromoCode(type, referenceId);

    return {
      receiptNumber: receiptNumberFrom(type, referenceId),
      documentType: paid ? 'RECEIPT' : 'INVOICE',
      issuedAt: new Date().toISOString(),
      referenceType: type,
      referenceId,
      serviceLabel: info.title ?? SERVICE_TYPE_LABELS[type] ?? type,
      serviceTypeLabel: SERVICE_TYPE_LABELS[type] ?? type,
      customer: { name: user?.name, phone: user?.phone, email },
      lines,
      subtotalCdf,
      discountCdf,
      totalCdf,
      currency: 'CDF',
      promoCode,
      payment,
      footerNote: paid
        ? type === 'RENTAL'
          ? 'Ce document atteste du paiement. La caution indiquée est remboursée après restitution du véhicule.'
          : 'Ce document atteste du paiement de votre prestation MOVA.'
        : 'Facture pro forma — en attente de paiement.',
    };
  }

  private async resolvePromoCode(type: string, id: string): Promise<string | null> {
    if (type === 'RIDE') {
      const row = await this.prisma.ride.findUnique({ where: { id }, select: { promoCode: true } });
      return row?.promoCode ?? null;
    }
    if (type === 'DELIVERY') {
      const row = await this.prisma.delivery.findUnique({ where: { id }, select: { promoCode: true } });
      return row?.promoCode ?? null;
    }
    if (type === 'ERRAND') {
      const row = await this.prisma.errandOrder.findUnique({ where: { id }, select: { promoCode: true } });
      return row?.promoCode ?? null;
    }
    if (type === 'MOVING') {
      const row = await this.prisma.movingRequest.findUnique({ where: { id }, select: { promoCode: true } });
      return row?.promoCode ?? null;
    }
    if (type === 'RENTAL') {
      const row = await this.prisma.rentalInquiry.findUnique({ where: { id }, select: { promoCode: true } });
      return row?.promoCode ?? null;
    }
    if (type === 'SCHEDULED') {
      const row = await this.prisma.scheduledRide.findUnique({ where: { id }, select: { promoCode: true } });
      return row?.promoCode ?? null;
    }
    return null;
  }

  private async buildLines(type: string, id: string, totalCdf: number): Promise<ReceiptLine[]> {
    const lines: ReceiptLine[] = [];

    if (type === 'RIDE') {
      const ride = await this.prisma.ride.findUnique({ where: { id } });
      if (ride) {
        const base = (ride.estimatedFareCdf ?? 0) + (ride.discountCdf ?? 0);
        if (ride.distanceKm != null) lines.push({ label: `Distance (${ride.distanceKm.toFixed(1)} km)`, amountCdf: 0, kind: 'item' });
        if (ride.discountCdf && ride.discountCdf > 0) {
          lines.push({ label: `Remise${ride.promoCode ? ` (${ride.promoCode})` : ''}`, amountCdf: ride.discountCdf, kind: 'discount' });
        }
        lines.push({ label: 'Course taxi', amountCdf: base || totalCdf, kind: 'subtotal' });
      }
    } else if (type === 'DELIVERY') {
      const d = await this.prisma.delivery.findUnique({ where: { id } });
      if (d) {
        if (d.type === DeliveryType.FOOD) lines.push({ label: 'Commande repas + livraison', amountCdf: totalCdf + (d.discountCdf ?? 0), kind: 'item' });
        else lines.push({ label: d.type === DeliveryType.EXPRESS ? 'Livraison express' : 'Livraison colis', amountCdf: totalCdf + (d.discountCdf ?? 0), kind: 'item' });
        if (d.discountCdf && d.discountCdf > 0) {
          lines.push({ label: `Remise${d.promoCode ? ` (${d.promoCode})` : ''}`, amountCdf: d.discountCdf, kind: 'discount' });
        }
      }
    } else if (type === 'ERRAND') {
      const e = await this.prisma.errandOrder.findUnique({ where: { id } });
      if (e) {
        if (e.purchaseTotalCdf && e.purchaseTotalCdf > 0) {
          lines.push({ label: 'Achats pour le compte', amountCdf: e.purchaseTotalCdf, kind: 'item' });
        }
        const fee = (e.finalPriceCdf ?? e.estimatedPriceCdf ?? 0);
        lines.push({ label: 'Frais de service', amountCdf: fee, kind: 'fee' });
        if (e.discountCdf && e.discountCdf > 0) {
          lines.push({ label: `Remise${e.promoCode ? ` (${e.promoCode})` : ''}`, amountCdf: e.discountCdf, kind: 'discount' });
        }
      }
    } else if (type === 'MOVING') {
      lines.push({ label: 'Déménagement', amountCdf: totalCdf, kind: 'item' });
    } else if (type === 'RENTAL') {
      lines.push(...(await this.buildRentalLines(id, totalCdf)));
      return lines;
    } else if (type === 'SCHEDULED') {
      const s = await this.prisma.scheduledRide.findUnique({ where: { id } });
      lines.push({ label: 'Course planifiée', amountCdf: totalCdf + (s?.discountCdf ?? 0), kind: 'item' });
      if (s?.discountCdf && s.discountCdf > 0) {
        lines.push({ label: `Remise${s.promoCode ? ` (${s.promoCode})` : ''}`, amountCdf: s.discountCdf, kind: 'discount' });
      }
    } else {
      lines.push({ label: SERVICE_TYPE_LABELS[type] ?? 'Prestation MOVA', amountCdf: totalCdf, kind: 'item' });
    }

    lines.push({ label: 'Total à payer', amountCdf: totalCdf, kind: 'total' });
    return lines;
  }

  private rentalDays(startDate: Date, endDate: Date): number {
    return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)));
  }

  private rentalHours(startDate: Date, endDate: Date): number {
    return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (3600 * 1000)));
  }

  private async buildRentalLines(id: string, totalCdf: number): Promise<ReceiptLine[]> {
    const r = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!r) {
      return [
        { label: 'Location véhicule', amountCdf: totalCdf, kind: 'item' },
        { label: 'Total payé', amountCdf: totalCdf, kind: 'total' },
      ];
    }
    const depositCdf = r.vehicle?.depositCdf ?? 0;
    const discountCdf = r.discountCdf ?? 0;
    const days = this.rentalDays(r.startDate, r.endDate);
    const hours = r.rentalPeriod === 'HOURLY' ? this.rentalHours(r.startDate, r.endDate) : 0;
    const vehicleLabel = r.vehicle?.name ?? r.vehicleType ?? 'Location véhicule';
    const rentalPortionCdf = Math.max(0, totalCdf - depositCdf);
    const durationLabel =
      r.rentalPeriod === 'HOURLY'
        ? `${hours} heure${hours > 1 ? 's' : ''}`
        : `${days} jour${days > 1 ? 's' : ''}`;
    const lines: ReceiptLine[] = [
      {
        label: `${vehicleLabel} · ${durationLabel}`,
        amountCdf: rentalPortionCdf + discountCdf,
        kind: 'item',
      },
    ];
    if (depositCdf > 0) {
      lines.push({
        label: 'Caution remboursable (restituée à la fin)',
        amountCdf: depositCdf,
        kind: 'fee',
      });
    }
    if (discountCdf > 0) {
      lines.push({
        label: `Remise${r.promoCode ? ` (${r.promoCode})` : ''}`,
        amountCdf: discountCdf,
        kind: 'discount',
      });
    }
    lines.push({ label: 'Total payé', amountCdf: totalCdf, kind: 'total' });
    return lines;
  }

  async getPdf(userId: string, referenceType: string, referenceId: string) {
    const receipt = await this.buildReceipt(userId, referenceType, referenceId);
    const buffer = await buildReceiptPdf(receipt);
    return { receipt, buffer, filename: `${receipt.receiptNumber}.pdf` };
  }

  async getThermal(userId: string, referenceType: string, referenceId: string) {
    const receipt = await this.buildReceipt(userId, referenceType, referenceId);
    const text = buildThermalReceiptText(receipt);
    const escPos = buildEscPosBuffer(text);
    return { receipt, text, escPos, filename: `${receipt.receiptNumber}-thermal.pdf` };
  }

  async getThermalPdf(userId: string, referenceType: string, referenceId: string) {
    const receipt = await this.buildReceipt(userId, referenceType, referenceId);
    const text = buildThermalReceiptText(receipt);
    const escPos = buildEscPosBuffer(text);
    const pdfBuffer = await buildThermalPdf(receipt);
    return { receipt, text, escPos, pdfBuffer, filename: `${receipt.receiptNumber}-thermal.pdf` };
  }

  async sendEmail(userId: string, referenceType: string, referenceId: string, email?: string) {
    const receipt = await this.buildReceipt(userId, referenceType, referenceId);
    const to = email?.trim() || receipt.customer.email;
    if (!to) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Aucune adresse e-mail — renseignez votre e-mail dans le profil.');
    }
    const { buffer } = await this.getPdf(userId, referenceType, referenceId);
    const subject = `${receipt.documentType === 'RECEIPT' ? 'Reçu' : 'Facture'} MOVA ${receipt.receiptNumber}`;
    const text = [
      `Bonjour${receipt.customer.name ? ` ${receipt.customer.name}` : ''},`,
      '',
      `Veuillez trouver ci-joint votre ${receipt.documentType === 'RECEIPT' ? 'reçu' : 'facture'} MOVA.`,
      `Référence : ${receipt.receiptNumber}`,
      `Montant : ${receipt.totalCdf.toLocaleString('fr-CD')} FC`,
      `Service : ${receipt.serviceTypeLabel}`,
      '',
      'Merci d\'utiliser MOVA RDC.',
    ].join('\n');

    const res = await fetch(serviceUrl('notification', '/internal/email'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({
        to,
        subject,
        text,
        attachment: { filename: `${receipt.receiptNumber}.pdf`, contentBase64: buffer.toString('base64'), mimeType: 'application/pdf' },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new MovaHttpException(MovaErrorCode.INTERNAL_ERROR, HttpStatus.BAD_GATEWAY, `Envoi e-mail impossible.${body ? ` ${body}` : ''}`);
    }
    return { success: true, sentTo: to, receiptNumber: receipt.receiptNumber };
  }

  async shareInChat(userId: string, referenceType: string, referenceId: string) {
    const receipt = await this.buildReceipt(userId, referenceType, referenceId);
    const type = referenceType.toUpperCase();
    const summary = [
      `📄 ${receipt.documentType === 'RECEIPT' ? 'Reçu' : 'Facture'} MOVA ${receipt.receiptNumber}`,
      `${receipt.serviceTypeLabel} — ${receipt.totalCdf.toLocaleString('fr-CD')} FC`,
      receipt.payment ? `Paiement : ${receipt.payment.methodLabel} (${receipt.payment.status})` : 'En attente de paiement',
      `Réf. ${referenceId.slice(0, 8)}…`,
    ].join('\n');

    if (type === 'RIDE' || type === 'SCHEDULED') {
      const rideId =
        type === 'RIDE'
          ? referenceId
          : (await this.prisma.scheduledRide.findUnique({ where: { id: referenceId }, select: { rideId: true } }))?.rideId;
      if (!rideId) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Chat indisponible pour ce service.');
      }
      await this.rideChat.sendMessage(rideId, userId, summary);
      return { success: true, channel: 'ride_chat', rideId };
    }
    if (type === 'ERRAND') {
      await this.errandChat.sendMessage(referenceId, userId, summary);
      return { success: true, channel: 'errand_chat', errandId: referenceId };
    }
    if (type === 'DELIVERY') {
      await this.deliveryChat.sendMessage(referenceId, userId, summary);
      return { success: true, channel: 'delivery_chat', deliveryId: referenceId };
    }
    if (type === 'RENTAL') {
      await this.rentalChat.sendMessage(referenceId, userId, summary);
      return { success: true, channel: 'rental_chat', inquiryId: referenceId };
    }
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      'Partage chat indisponible pour ce service. Utilisez l\'e-mail.',
    );
  }
}
