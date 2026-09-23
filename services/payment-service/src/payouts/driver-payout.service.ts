import { Injectable, Logger } from '@nestjs/common';
import { CashDebtCategory } from '@prisma/client';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DriverDebtLedgerService } from '../ledger/driver-debt-ledger.service';

type PayoutItem = {
  referenceType: string;
  referenceId: string;
  driverNetCdf: number;
};

@Injectable()
export class DriverPayoutService {
  private readonly logger = new Logger(DriverPayoutService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private debts: DriverDebtLedgerService,
  ) {}

  private payoutReference(referenceType: string, referenceId: string) {
    return `${referenceType.toUpperCase()}_PAYOUT:${referenceId}`;
  }

  private async alreadyCredited(reference: string) {
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { reference, type: 'CREDIT' },
    });
    return !!existing;
  }

  async creditPayout(driverUserId: string, item: PayoutItem) {
    const amount = Math.round(item.driverNetCdf);
    if (amount <= 0) return { credited: false, reason: 'zero_amount' as const };

    const reference = this.payoutReference(item.referenceType, item.referenceId);
    if (await this.alreadyCredited(reference)) {
      return { credited: false, reason: 'already_credited' as const, reference };
    }

    const type = item.referenceType.toUpperCase();
    const label =
      type === 'DELIVERY'
        ? `Revenu livraison ${item.referenceId}`
        : type === 'MOVING'
          ? `Revenu déménagement ${item.referenceId}`
          : type === 'ERRAND'
            ? `Revenu course & commission ${item.referenceId}`
            : type === 'RENTAL'
              ? `Revenu location ${item.referenceId}`
              : type === 'CARPOOL'
                ? `Revenu covoiturage ${item.referenceId}`
                : type === 'SCHEDULED'
                  ? `Revenu course planifiée ${item.referenceId}`
                  : type === 'RIDE_SHARE'
                    ? `Revenu course Pool ${item.referenceId}`
                    : `Revenu course ${item.referenceId}`;

    const wallet = await this.wallet.credit(driverUserId, amount, label, reference);
    return { credited: true, amountCdf: amount, reference, balanceCdf: wallet.balanceCdf };
  }

  private async paymentMethodFor(
    referenceType: string,
    referenceId: string,
  ): Promise<string | null> {
    const type = referenceType.toUpperCase();
    if (type === 'RIDE' || type === 'SCHEDULED') {
      if (type === 'RIDE') {
        const pay = await this.prisma.payment.findUnique({ where: { rideId: referenceId } });
        if (pay?.status === 'COMPLETED') return pay.method;
      }
      const sp = await this.prisma.servicePayment.findUnique({
        where: { referenceType_referenceId: { referenceType: type, referenceId } },
      });
      if (sp?.status === 'COMPLETED') return sp.method;
      return null;
    }
    const sp = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (sp?.status === 'COMPLETED') return sp.method;
    return null;
  }

  /** Annule un crédit wallet erroné pour un job payé en espèces. */
  private async clawbackCashPayoutIfNeeded(
    driverUserId: string,
    item: PayoutItem,
  ): Promise<{ clawedBack: boolean; amountCdf?: number }> {
    const reference = this.payoutReference(item.referenceType, item.referenceId);
    if (!(await this.alreadyCredited(reference))) {
      return { clawedBack: false };
    }
    const clawbackRef = `CLAWBACK_CASH:${reference}`;
    const alreadyClawed = await this.prisma.walletTransaction.findFirst({
      where: { reference: clawbackRef, type: 'DEBIT' },
    });
    if (alreadyClawed) return { clawedBack: false };

    const debtMarker = `CASH_DEBT:PLATFORM_FEE:CLAWBACK_CASH:${reference}`;
    const existingDebt = await this.prisma.driverCashDebt.findUnique({ where: { reference: debtMarker } });
    if (existingDebt) return { clawedBack: false };

    const amount = Math.round(item.driverNetCdf);
    if (amount <= 0) return { clawedBack: false };

    const wallet = await this.wallet.getWallet(driverUserId);
    const available = Math.max(
      0,
      Number(wallet.availableBalanceCdf ?? wallet.balanceCdf - (wallet.heldBalanceCdf ?? 0)),
    );
    const toDebit = Math.min(amount, available);
    let clawed = 0;
    if (toDebit > 0) {
      try {
        await this.wallet.debit(
          driverUserId,
          toDebit,
          `Correction — gain espèces (non retirable) ${item.referenceId}`,
          clawbackRef,
        );
        clawed = toDebit;
      } catch (e) {
        this.logger.warn(`clawbackCashPayout ${reference} debit failed`, e);
      }
    }

    const remaining = amount - clawed;
    if (remaining > 0) {
      // Solde déjà dépensé : dette plateforme (espèces ne doivent jamais rester « retirables »).
      await this.debts.recordDebt({
        driverUserId,
        referenceType: 'CLAWBACK_CASH',
        referenceId: reference,
        category: CashDebtCategory.PLATFORM_FEE,
        amountCdf: remaining,
        description: `Correction gain espèces crédité à tort ${item.referenceId.slice(0, 8)}`,
      });
    }

    return { clawedBack: clawed > 0 || remaining > 0, amountCdf: clawed };
  }

  private async fetchPayoutItems(driverUserId: string): Promise<PayoutItem[]> {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/rides/driver/${driverUserId}/payout-items`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) {
        this.logger.warn(`fetchPayoutItems ${driverUserId} failed: HTTP ${res.status}`);
        return [];
      }
      const body = (await res.json()) as { items?: PayoutItem[] };
      return body.items ?? [];
    } catch (e) {
      this.logger.warn(`fetchPayoutItems ${driverUserId} unreachable`, e);
      return [];
    }
  }

  async syncDriverPayouts(driverUserId: string) {
    const items = await this.fetchPayoutItems(driverUserId);
    let creditedCdf = 0;
    let creditedCount = 0;
    let clawedBackCdf = 0;
    let clawedBackCount = 0;
    for (const item of items) {
      const method = await this.paymentMethodFor(item.referenceType, item.referenceId);
      // Espèces : le chauffeur a déjà l'argent en main — jamais au portefeuille retirable.
      if (method === 'CASH') {
        const claw = await this.clawbackCashPayoutIfNeeded(driverUserId, item);
        if (claw.clawedBack) {
          clawedBackCdf += claw.amountCdf ?? 0;
          clawedBackCount += 1;
        }
        continue;
      }
      // Paiement inconnu / non complété : ne pas créditer (évite double paiement).
      if (method == null) continue;
      const result = await this.creditPayout(driverUserId, item);
      if (result.credited) {
        creditedCdf += result.amountCdf ?? 0;
        creditedCount += 1;
      }
    }
    const wallet = await this.wallet.getWallet(driverUserId);
    return {
      synced: true,
      creditedCount,
      creditedCdf,
      clawedBackCount,
      clawedBackCdf,
      walletBalanceCdf: wallet.balanceCdf,
      itemCount: items.length,
    };
  }

  async creditRidePayoutFromPayment(rideId: string, driverUserId: string, driverNetCdf: number) {
    const pay = await this.prisma.payment.findUnique({ where: { rideId } });
    if (pay?.method === 'CASH') {
      this.logger.warn(`creditRidePayoutFromPayment refused CASH ride ${rideId}`);
      return { credited: false, reason: 'cash_not_withdrawable' as const };
    }
    return this.creditPayout(driverUserId, {
      referenceType: 'RIDE',
      referenceId: rideId,
      driverNetCdf,
    });
  }

  async fetchRidePayout(rideId: string): Promise<{ driverId?: string; driverNetCdf: number; grossCdf?: number } | null> {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/rides/${rideId}/payout`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      this.logger.warn(`fetchRidePayout ${rideId} unreachable`, e);
      return null;
    }
  }
}
