import { Injectable, Logger } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

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

    const label =
      item.referenceType.toUpperCase() === 'DELIVERY'
        ? `Revenu livraison ${item.referenceId}`
        : `Revenu course ${item.referenceId}`;

    const wallet = await this.wallet.credit(driverUserId, amount, label, reference);
    return { credited: true, amountCdf: amount, reference, balanceCdf: wallet.balanceCdf };
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
    for (const item of items) {
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
      walletBalanceCdf: wallet.balanceCdf,
      itemCount: items.length,
    };
  }

  async creditRidePayoutFromPayment(rideId: string, driverUserId: string, driverNetCdf: number) {
    return this.creditPayout(driverUserId, {
      referenceType: 'RIDE',
      referenceId: rideId,
      driverNetCdf,
    });
  }

  async fetchRidePayout(rideId: string): Promise<{ driverId?: string; driverNetCdf: number } | null> {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/rides/${rideId}/payout`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }
}
