import { Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, Prisma } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  creditRestaurantEscrow,
  freezeEscrow,
  refundEscrow,
  releaseEscrowPayout,
  settleEscrowPartial,
} from '../common/escrow.util';
import { parseOrderPlacedMetadata } from './food-delivery-settlement.util';
import {
  assertEscrowAllowsDispatch,
  cancelPhase,
  isDeliveryPrepaidRequired,
  isPinTimeoutDue,
  resolveCourierSource,
  settleGuaranteedCancel,
  shouldReturnToSender,
} from './delivery-guarantee.util';

@Injectable()
export class DeliveryEscrowService {
  private readonly logger = new Logger(DeliveryEscrowService.name);

  constructor(private prisma: PrismaService) {}

  prepaidRequired(): boolean {
    return isDeliveryPrepaidRequired();
  }

  createDefaults(amountCdf: number) {
    const guaranteed = this.prepaidRequired();
    return {
      guaranteed,
      escrowReady: false,
      escrowAmountCdf: amountCdf,
    };
  }

  assertDispatch(delivery: {
    guaranteed?: boolean | null;
    escrowReady?: boolean | null;
    fundsFrozenAt?: Date | null;
    escrowAmountCdf?: number | null;
    estimatedPriceCdf?: number | null;
  }) {
    assertEscrowAllowsDispatch(delivery);
  }

  async isRestaurantFleetDriver(restaurantId: string | null | undefined, driverUserId: string): Promise<boolean> {
    if (!restaurantId) return false;
    const row = await this.prisma.restaurantDriver.findUnique({
      where: { restaurantId_driverUserId: { restaurantId, driverUserId } },
    });
    return Boolean(row?.isActive);
  }

  async resolveSource(restaurantId: string | null | undefined, driverUserId: string) {
    if (!restaurantId) return 'PLATFORM' as const;
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { courierMode: true },
    });
    const fleet = await this.isRestaurantFleetDriver(restaurantId, driverUserId);
    return resolveCourierSource({
      restaurantCourierMode: restaurant?.courierMode,
      driverIsRestaurantFleet: fleet,
    });
  }

  async markEscrowReady(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND);
    if (delivery.escrowReady) return delivery;
    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { escrowReady: true },
      include: { restaurant: true },
    });
    await this.prisma.deliveryEvent.create({
      data: { deliveryId, event: 'ESCROW_READY', metadata: { amountCdf: updated.escrowAmountCdf ?? updated.estimatedPriceCdf } },
    });
    return updated;
  }

  async creditRestaurantAtPickup(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { events: true },
    });
    if (!delivery || delivery.type !== DeliveryType.FOOD) return { credited: false as const };
    if (!delivery.guaranteed || !delivery.escrowReady) return { credited: false as const };
    if (delivery.restaurantCreditedAt) return { credited: false as const, already: true };

    // Choix métier : le resto est crédité à PICKED_UP (plat sorti de cuisine).
    // Le livreur n'est crédité qu'au PIN. Voir docs/integrations/afrisoft-pay-hub.md §10.5.
    try {
      await creditRestaurantEscrow('DELIVERY', deliveryId);
      await this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { restaurantCreditedAt: new Date() },
      });
      await this.prisma.deliveryEvent.create({
        data: { deliveryId, event: 'RESTAURANT_CREDITED' },
      });
      return { credited: true as const };
    } catch (e) {
      this.logger.warn(`creditRestaurantAtPickup ${deliveryId} failed`, e);
      return { credited: false as const };
    }
  }

  async releaseCourierAtPin(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery?.guaranteed || delivery.payoutReleasedAt) return { released: false as const };
    try {
      await releaseEscrowPayout('DELIVERY', deliveryId);
      await this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { payoutReleasedAt: new Date() },
      });
      await this.prisma.deliveryEvent.create({
        data: { deliveryId, event: 'ESCROW_RELEASED' },
      });
      return { released: true as const };
    } catch (e) {
      this.logger.warn(`releaseCourierAtPin ${deliveryId} failed`, e);
      return { released: false as const };
    }
  }

  async settleCancel(delivery: {
    id: string;
    type: DeliveryType;
    status: DeliveryStatus;
    guaranteed?: boolean | null;
    escrowReady?: boolean | null;
    escrowAmountCdf?: number | null;
    estimatedPriceCdf?: number | null;
    restaurantCreditedAt?: Date | null;
    events?: { event: string; metadata: unknown }[];
  }) {
    if (!delivery.guaranteed || !delivery.escrowReady) return;
    const meta = parseOrderPlacedMetadata(delivery.events);
    const escrow = delivery.escrowAmountCdf ?? delivery.estimatedPriceCdf ?? 0;
    const deliveryFee = meta.deliveryFeeCdf ?? 0;
    const restaurantCredited = delivery.restaurantCreditedAt
      ? Math.max(0, escrow - deliveryFee)
      : 0;
    const settlement = settleGuaranteedCancel({
      phase: cancelPhase(delivery.status),
      escrowAmountCdf: escrow,
      deliveryFeeCdf: deliveryFee,
      restaurantAlreadyCreditedCdf: restaurantCredited,
    });
    try {
      if (settlement.action === 'REFUND') {
        await refundEscrow('DELIVERY', delivery.id, settlement.reason);
      } else if (settlement.action === 'PARTIAL') {
        await settleEscrowPartial({
          referenceType: 'DELIVERY',
          referenceId: delivery.id,
          courierFeeCdf: settlement.courierFeeCdf,
          refundCdf: settlement.refundCdf,
          reason: settlement.reason,
        });
      } else {
        await freezeEscrow('DELIVERY', delivery.id, settlement.reason);
        await this.prisma.delivery.update({
          where: { id: delivery.id },
          data: { fundsFrozenAt: new Date() },
        });
      }
    } catch (e) {
      this.logger.warn(`settleCancel ${delivery.id} failed`, e);
    }
  }

  async freezePinTimeout(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery?.guaranteed || delivery.fundsFrozenAt || delivery.payoutReleasedAt) return { frozen: false };
    if (
      !isPinTimeoutDue({
        type: delivery.type,
        status: delivery.status,
        inTransitSince: delivery.pickedUpAt ?? undefined,
        fundsFrozenAt: delivery.fundsFrozenAt,
        payoutReleasedAt: delivery.payoutReleasedAt,
      })
    ) {
      return { frozen: false };
    }
    await freezeEscrow('DELIVERY', deliveryId, 'Délai PIN dépassé — fonds gelés, pas de versement livreur.');
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { fundsFrozenAt: new Date() },
    });
    await this.prisma.deliveryEvent.create({
      data: { deliveryId, event: 'ESCROW_FROZEN', metadata: { reason: 'PIN_TIMEOUT' } as Prisma.InputJsonValue },
    });
    return { frozen: true };
  }

  async recordUnreachable(deliveryId: string, driverUserId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND);
    if (delivery.driverId !== driverUserId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED);
    }
    const attempts = (delivery.unreachableAttempts ?? 0) + 1;
    const first = delivery.firstUnreachableAt ?? new Date();
    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        unreachableAttempts: attempts,
        firstUnreachableAt: delivery.firstUnreachableAt ?? first,
      },
    });
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId,
        event: 'UNREACHABLE_ATTEMPT',
        metadata: { attempts, driverUserId } as Prisma.InputJsonValue,
      },
    });
    const shouldReturn = shouldReturnToSender({
      unreachableAttempts: attempts,
      firstUnreachableAt: updated.firstUnreachableAt,
    });
    if (shouldReturn && delivery.guaranteed && delivery.escrowReady && !delivery.payoutReleasedAt) {
      const meta = parseOrderPlacedMetadata([]);
      const escrow = delivery.escrowAmountCdf ?? delivery.estimatedPriceCdf;
      const settlement = settleGuaranteedCancel({
        phase: 'RETURN_TO_SENDER',
        escrowAmountCdf: escrow,
        deliveryFeeCdf: meta.deliveryFeeCdf ?? Math.round(escrow * 0.25),
        restaurantAlreadyCreditedCdf: delivery.restaurantCreditedAt ? Math.max(0, escrow - (meta.deliveryFeeCdf ?? 0)) : 0,
      });
      if (settlement.action === 'PARTIAL') {
        await settleEscrowPartial({
          referenceType: 'DELIVERY',
          referenceId: deliveryId,
          courierFeeCdf: settlement.courierFeeCdf,
          refundCdf: settlement.refundCdf,
          reason: settlement.reason,
        });
        await this.prisma.delivery.update({
          where: { id: deliveryId },
          data: { payoutReleasedAt: new Date() },
        });
      } else {
        await freezeEscrow('DELIVERY', deliveryId, settlement.reason);
        await this.prisma.delivery.update({
          where: { id: deliveryId },
          data: { fundsFrozenAt: new Date() },
        });
      }
    }
    return { attempts, returnToSender: shouldReturn };
  }
}
