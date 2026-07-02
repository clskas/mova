import { Injectable, Logger } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DriverPayoutService } from './driver-payout.service';

type FoodSettlement = {
  referenceType: string;
  referenceId: string;
  deliveryType: string | null;
  totalPaidCdf: number;
  platformFeeCdf: number;
  driver: { userId: string; grossCdf: number; netCdf: number; platformFeeCdf: number } | null;
  restaurants: {
    restaurantId: string;
    ownerUserId: string | null;
    grossCdf: number;
    netCdf: number;
    platformFeeCdf: number;
  }[];
};

@Injectable()
export class FoodDeliveryPayoutService {
  private readonly logger = new Logger(FoodDeliveryPayoutService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private driverPayouts: DriverPayoutService,
  ) {}

  private restaurantReference(deliveryId: string, restaurantId: string) {
    return `DELIVERY_FOOD_RESTAURANT:${deliveryId}:${restaurantId}`;
  }

  private async alreadyCredited(reference: string) {
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { reference, type: 'CREDIT' },
    });
    return !!existing;
  }

  private async creditRestaurant(ownerUserId: string, deliveryId: string, restaurantId: string, netCdf: number) {
    const amount = Math.round(netCdf);
    if (amount <= 0) return { credited: false, reason: 'zero_amount' as const };

    const reference = this.restaurantReference(deliveryId, restaurantId);
    if (await this.alreadyCredited(reference)) {
      return { credited: false, reason: 'already_credited' as const, reference };
    }

    const label = `Vente repas commande ${deliveryId.slice(0, 8)}`;
    const wallet = await this.wallet.credit(ownerUserId, amount, label, reference);
    return { credited: true, amountCdf: amount, reference, balanceCdf: wallet.balanceCdf };
  }

  private async fetchSettlement(deliveryId: string): Promise<FoodSettlement | null> {
    try {
      const res = await fetch(serviceUrl('ride', `/internal/services/DELIVERY/${deliveryId}/food-settlement`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      this.logger.warn(`fetchSettlement ${deliveryId} unreachable`, e);
      return null;
    }
  }

  async creditFoodDeliverySettlement(deliveryId: string) {
    const settlement = await this.fetchSettlement(deliveryId);
    if (!settlement || settlement.deliveryType !== 'FOOD') {
      return { handled: false as const };
    }

    const results: Record<string, unknown> = { handled: true as const, driver: null, restaurants: [] as unknown[] };

    if (settlement.driver?.userId && settlement.driver.netCdf > 0) {
      results.driver = await this.driverPayouts.creditPayout(settlement.driver.userId, {
        referenceType: 'DELIVERY',
        referenceId: deliveryId,
        driverNetCdf: settlement.driver.netCdf,
      });
    }

    const restaurantResults = [];
    for (const restaurant of settlement.restaurants) {
      if (!restaurant.ownerUserId || restaurant.netCdf <= 0) continue;
      restaurantResults.push(
        await this.creditRestaurant(restaurant.ownerUserId, deliveryId, restaurant.restaurantId, restaurant.netCdf),
      );
    }
    results.restaurants = restaurantResults;
    results.platformFeeCdf = settlement.platformFeeCdf;
    results.totalPaidCdf = settlement.totalPaidCdf;

    return results;
  }
}
