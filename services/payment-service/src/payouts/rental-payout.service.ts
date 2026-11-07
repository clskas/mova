import { Injectable, Logger } from '@nestjs/common';
import { CashDebtCategory, PaymentMethod } from '@prisma/client';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DriverPayoutService } from './driver-payout.service';
import { DriverDebtLedgerService } from '../ledger/driver-debt-ledger.service';

type RentalSettlement = {
  referenceType: string;
  referenceId: string;
  ownerUserId: string | null;
  partnerNetCdf: number;
  platformFeeCdf: number;
  subtotalGrossCdf: number;
  depositCdf: number;
  /** What the customer paid for the rental itself (deposit excluded). */
  rentalPaidCdf?: number;
  logistics: {
    driverId: string;
    grossCdf: number;
    netCdf: number;
    platformFeeCdf: number;
  } | null;
};

@Injectable()
export class RentalPayoutService {
  private readonly logger = new Logger(RentalPayoutService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private driverPayouts: DriverPayoutService,
    private debtLedger: DriverDebtLedgerService,
  ) {}

  private ownerReference(bookingId: string) {
    return `RENTAL_OWNER:${bookingId}`;
  }

  private async alreadyCredited(reference: string) {
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { reference, type: 'CREDIT' },
    });
    return !!existing;
  }

  private async fetchSettlement(bookingId: string): Promise<RentalSettlement | null> {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/services/RENTAL/${bookingId}/rental-settlement`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      this.logger.warn(`fetchRentalSettlement ${bookingId} unreachable`, e);
      return null;
    }
  }

  /**
   * Deposit paid online (held by SENGA): refund the customer, pay the part kept by the owner.
   * Paid in cash, the owner already holds it — nothing to move. Idempotent.
   */
  async settleDeposit(
    bookingId: string,
    input: { customerUserId: string; ownerUserId: string; depositCdf: number; retainedCdf: number },
  ) {
    const payment = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: 'RENTAL', referenceId: bookingId } },
    });
    if (!payment || payment.status !== 'COMPLETED') {
      return { moved: false as const, reason: 'not_paid_online' as const };
    }
    if (payment.method === PaymentMethod.CASH) {
      return { moved: false as const, reason: 'cash' as const };
    }
    const deposit = Math.max(0, Math.min(Math.round(input.depositCdf), payment.amountCdf));
    const retained = Math.max(0, Math.min(Math.round(input.retainedCdf), deposit));
    const refund = deposit - retained;
    if (refund > 0) {
      await this.wallet.credit(
        input.customerUserId,
        refund,
        `Caution rendue — location ${bookingId.slice(0, 8)}`,
        `RENTAL_DEPOSIT_REFUND:${bookingId}`,
      );
    }
    if (retained > 0) {
      await this.wallet.credit(
        input.ownerUserId,
        retained,
        `Caution retenue — location ${bookingId.slice(0, 8)}`,
        `RENTAL_DEPOSIT_RETAINED:${bookingId}`,
      );
    }
    return { moved: true as const, refundCdf: refund, retainedCdf: retained };
  }

  /**
   * Crédite propriétaire location + commission SENGA + chauffeur logistique (si MOVA_DRIVER).
   * Espèces confirmées par le loueur : pas de double crédit wallet propriétaire (cash en main).
   */
  async creditRentalSettlement(
    bookingId: string,
    paymentMethod: PaymentMethod = PaymentMethod.WALLET,
  ) {
    const settlement = await this.fetchSettlement(bookingId);
    if (!settlement) {
      return { handled: false as const };
    }

    const isCash = paymentMethod === PaymentMethod.CASH;
    const results: Record<string, unknown> = {
      handled: true as const,
      owner: null,
      logistics: null,
      platformFeeCdf: 0,
    };

    const ownerNet = Math.round(settlement.partnerNetCdf ?? 0);
    if (!isCash && settlement.ownerUserId && ownerNet > 0) {
      const reference = this.ownerReference(bookingId);
      if (!(await this.alreadyCredited(reference))) {
        const wallet = await this.wallet.credit(
          settlement.ownerUserId,
          ownerNet,
          `Revenu location ${bookingId}`,
          reference,
        );
        results.owner = { credited: true, amountCdf: ownerNet, reference, balanceCdf: wallet.balanceCdf };
      } else {
        results.owner = { credited: false, reason: 'already_credited', reference };
      }
    } else if (isCash && settlement.ownerUserId) {
      results.owner = { credited: false, reason: 'cash_in_hand', amountCdf: ownerNet };
    }

    const rentalPlatformFee = Math.round(settlement.platformFeeCdf ?? 0);
    const platformFeeRef = `PLATFORM_FEE:RENTAL:${bookingId}`;
    if (isCash && settlement.ownerUserId && rentalPlatformFee > 0) {
      // Espèces : dette seulement — crédit trésorerie au règlement guichet.
      await this.debtLedger.recordDebt({
        driverUserId: settlement.ownerUserId,
        referenceType: 'RENTAL',
        referenceId: bookingId,
        category: CashDebtCategory.PLATFORM_FEE,
        amountCdf: rentalPlatformFee,
        description: `Commission SENGA à reverser — location ${bookingId.slice(0, 8)}`,
      });
    } else if (rentalPlatformFee > 0 && !(await this.alreadyCredited(platformFeeRef))) {
      await this.wallet.creditPlatformFee(
        rentalPlatformFee,
        `Commission location ${bookingId.slice(0, 8)}`,
        platformFeeRef,
      );
    }
    results.platformFeeCdf = rentalPlatformFee;

    // SENGA-funded promo larger than its commission: the owner is due more than the customer
    // paid for the rental. SENGA pays the gap (credited in cash, where the owner holds only
    // what was paid) and records it as a promo cost.
    if (settlement.ownerUserId && settlement.rentalPaidCdf != null) {
      const ownerShortfall = Math.max(0, ownerNet - Math.round(settlement.rentalPaidCdf));
      if (ownerShortfall > 0) {
        if (isCash) {
          const ref = `PROMO_TOPUP:RENTAL:${bookingId}`;
          if (!(await this.alreadyCredited(ref))) {
            await this.wallet.credit(
              settlement.ownerUserId,
              ownerShortfall,
              `Compensation promo SENGA (location ${bookingId.slice(0, 8)})`,
              ref,
            );
          }
        }
        await this.wallet.recordPlatformPromoCost(
          ownerShortfall,
          `Promo financée par SENGA — location ${bookingId.slice(0, 8)}`,
          `PROMO_COST:RENTAL:${bookingId}`,
        );
      }
    }

    const logistics = settlement.logistics;
    if (logistics?.driverId && logistics.netCdf > 0) {
      if (!isCash) {
        results.logistics = await this.driverPayouts.creditPayout(logistics.driverId, {
          referenceType: 'RENTAL',
          referenceId: bookingId,
          driverNetCdf: logistics.netCdf,
        });
      }
      const logisticsPlatformFee = Math.max(0, Math.round(logistics.grossCdf - logistics.netCdf));
      const logisticsFeeRef = `PLATFORM_FEE:RENTAL_LOGISTICS:${bookingId}`;
      if (isCash && logisticsPlatformFee > 0) {
        await this.debtLedger.recordDebt({
          driverUserId: logistics.driverId,
          referenceType: 'RENTAL',
          referenceId: bookingId,
          category: CashDebtCategory.PLATFORM_FEE,
          amountCdf: logisticsPlatformFee,
          description: `Commission logistique à reverser — location ${bookingId.slice(0, 8)}`,
        });
      } else if (logisticsPlatformFee > 0 && !(await this.alreadyCredited(logisticsFeeRef))) {
        await this.wallet.creditPlatformFee(
          logisticsPlatformFee,
          `Commission logistique location ${bookingId.slice(0, 8)}`,
          logisticsFeeRef,
        );
      }
      if (isCash) {
        results.logistics = { credited: false, reason: 'cash', netCdf: logistics.netCdf };
      }
    }

    results.paymentMethod = paymentMethod;
    return results;
  }
}
