import { Injectable, Logger } from '@nestjs/common';
import { CashDebtCategory, PaymentMethod, PaymentStatus } from '@prisma/client';
import { INTERNAL_API_KEY, MOVA_PLATFORM_USER_ID, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

type PayoutItem = {
  referenceType: string;
  referenceId: string;
  driverNetCdf: number;
};

/**
 * Gains espèces (non retirables) vs solde virtuel (wallet retirable).
 * Espèces = parts nettes des jobs CASH ; virtuel = balanceCdf du portefeuille.
 */
@Injectable()
export class CashVirtualEarningsService {
  private readonly logger = new Logger(CashVirtualEarningsService.name);

  constructor(private prisma: PrismaService) {}

  private async fetchPayoutItems(driverUserId: string): Promise<PayoutItem[]> {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/rides/driver/${driverUserId}/payout-items?take=500`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { items?: PayoutItem[] };
      return body.items ?? [];
    } catch (e) {
      this.logger.warn(`fetchPayoutItems ${driverUserId} unreachable`, e);
      return [];
    }
  }

  private async paymentMethodFor(
    referenceType: string,
    referenceId: string,
  ): Promise<PaymentMethod | null> {
    const type = referenceType.toUpperCase();
    if (type === 'RIDE' || type === 'SCHEDULED') {
      const rideId = type === 'SCHEDULED' ? referenceId : referenceId;
      if (type === 'RIDE') {
        const pay = await this.prisma.payment.findUnique({ where: { rideId } });
        if (pay?.status === PaymentStatus.COMPLETED) return pay.method;
      }
      const sp = await this.prisma.servicePayment.findUnique({
        where: { referenceType_referenceId: { referenceType: type, referenceId } },
      });
      if (sp?.status === PaymentStatus.COMPLETED) return sp.method;
      return null;
    }
    const sp = await this.prisma.servicePayment.findUnique({
      where: { referenceType_referenceId: { referenceType: type, referenceId } },
    });
    if (sp?.status === PaymentStatus.COMPLETED) return sp.method;
    return null;
  }

  async getDriverCashVirtual(driverUserId: string) {
    const [items, wallet] = await Promise.all([
      this.fetchPayoutItems(driverUserId),
      this.prisma.wallet.findUnique({ where: { userId: driverUserId } }),
    ]);

    let cashEarningsCdf = 0;
    let prepaidEarningsCdf = 0;
    for (const item of items) {
      const method = await this.paymentMethodFor(item.referenceType, item.referenceId);
      const net = Math.round(item.driverNetCdf ?? 0);
      if (net <= 0) continue;
      if (method === PaymentMethod.CASH) {
        cashEarningsCdf += net;
      } else if (method != null) {
        prepaidEarningsCdf += net;
      }
    }

    const withdrawableCdf = wallet?.balanceCdf ?? 0;
    return {
      withdrawableCdf,
      cashEarningsCdf,
      prepaidEarningsCdf,
      currency: 'CDF',
    };
  }

  async getPartnerCashVirtual(beneficiaryUserId: string) {
    const [wallet, openDebts, allShareDebts] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId: beneficiaryUserId } }),
      this.prisma.driverCashDebt.findMany({
        where: {
          beneficiaryUserId,
          status: 'OPEN',
          category: { in: [CashDebtCategory.RESTAURANT_SHARE, CashDebtCategory.PARTNER_SHARE] },
        },
      }),
      this.prisma.driverCashDebt.findMany({
        where: {
          beneficiaryUserId,
          category: { in: [CashDebtCategory.RESTAURANT_SHARE, CashDebtCategory.PARTNER_SHARE] },
        },
      }),
    ]);

    const cashEarningsCdf = openDebts.reduce((s, d) => s + d.amountCdf, 0);
    const lifetimeCashShareCdf = allShareDebts.reduce((s, d) => s + d.amountCdf, 0);

    return {
      withdrawableCdf: wallet?.balanceCdf ?? 0,
      cashEarningsCdf,
      lifetimeCashShareCdf,
      currency: 'CDF',
    };
  }

  async getPlatformCashVirtual() {
    const platformWallet = await this.prisma.wallet.findUnique({
      where: { userId: MOVA_PLATFORM_USER_ID },
    });
    if (!platformWallet) {
      return {
        platformBalanceCdf: 0,
        deskCashCollectedCdf: 0,
        prepaidCommissionCdf: 0,
        currency: 'CDF',
      };
    }

    const [deskAgg, prepaidAgg] = await Promise.all([
      this.prisma.walletTransaction.aggregate({
        where: {
          walletId: platformWallet.id,
          type: 'CREDIT',
          reference: { startsWith: 'PLATFORM_FEE_CASH_COLLECT:' },
        },
        _sum: { amountCdf: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          walletId: platformWallet.id,
          type: 'CREDIT',
          reference: { startsWith: 'PLATFORM_FEE:' },
        },
        _sum: { amountCdf: true },
      }),
    ]);

    return {
      platformBalanceCdf: platformWallet.balanceCdf,
      deskCashCollectedCdf: deskAgg._sum.amountCdf ?? 0,
      prepaidCommissionCdf: prepaidAgg._sum.amountCdf ?? 0,
      currency: 'CDF',
    };
  }
}
