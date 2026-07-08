import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DeliveryCreatedPayload,
  DeliveryStatusUpdatedPayload,
  MOVA_EVENTS,
  PaymentCompletedPayload,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from './tracking.gateway';

@Injectable()
export class RestaurantPortalEventsService implements OnModuleInit {
  private readonly logger = new Logger(RestaurantPortalEventsService.name);

  constructor(
    private redis: RedisService,
    private gateway: TrackingGateway,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const channels = [
      MOVA_EVENTS.DELIVERY_CREATED,
      MOVA_EVENTS.DELIVERY_STATUS_UPDATED,
      MOVA_EVENTS.PAYMENT_COMPLETED,
    ];
    this.redis.sub.subscribe(...channels, (err) => {
      if (err) {
        this.logger.warn(`Redis subscribe unavailable: ${err.message}`);
        return;
      }
      this.logger.log('Restaurant portal live events subscribed');
    });
    this.redis.sub.on('message', (channel, message) => {
      void this.handleMessage(channel, message);
    });
  }

  private async handleMessage(channel: string, message: string) {
    try {
      if (channel === MOVA_EVENTS.DELIVERY_CREATED) {
        const payload = JSON.parse(message) as DeliveryCreatedPayload;
        const ownerIds = await this.resolveRestaurantOwnerUserIds(payload.deliveryId, payload.restaurantOwnerUserId);
        for (const ownerUserId of ownerIds) {
          this.gateway.broadcastRestaurantEvent(ownerUserId, {
            type: 'order',
            deliveryId: payload.deliveryId,
            status: 'PENDING',
          });
        }
        return;
      }
      if (channel === MOVA_EVENTS.DELIVERY_STATUS_UPDATED) {
        const payload = JSON.parse(message) as DeliveryStatusUpdatedPayload;
        const ownerIds = await this.resolveRestaurantOwnerUserIds(payload.deliveryId, payload.restaurantOwnerUserId);
        for (const ownerUserId of ownerIds) {
          this.gateway.broadcastRestaurantEvent(ownerUserId, {
            type: 'order-status',
            deliveryId: payload.deliveryId,
            status: payload.status,
          });
        }
        return;
      }
      if (channel === MOVA_EVENTS.PAYMENT_COMPLETED) {
        const payload = JSON.parse(message) as PaymentCompletedPayload;
        const referenceType = (payload.referenceType ?? 'RIDE').toUpperCase();
        if (referenceType !== 'DELIVERY' || !payload.referenceId) return;
        const ownerIds = await this.resolveRestaurantOwnerUserIds(payload.referenceId);
        for (const ownerUserId of ownerIds) {
          this.gateway.broadcastRestaurantEvent(ownerUserId, {
            type: 'order-payment',
            deliveryId: payload.referenceId!,
            status: 'PAID',
            isPaid: true,
            paymentStatus: 'COMPLETED',
          });
        }
      }
    } catch (e) {
      this.logger.warn('Restaurant portal event handler error', e);
    }
  }

  private deliveryIncludesRestaurant(items: unknown, restaurantId: string): boolean {
    if (!Array.isArray(items)) return false;
    return items.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return (entry as { restaurantId?: string }).restaurantId === restaurantId;
    });
  }

  private async resolveRestaurantOwnerUserIds(
    deliveryId: string,
    fallbackOwnerUserId?: string,
  ): Promise<string[]> {
    const ownerIds = new Set<string>();
    if (fallbackOwnerUserId) ownerIds.add(fallbackOwnerUserId);

    const row = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        restaurantId: true,
        items: true,
        restaurant: { select: { ownerUserId: true } },
      },
    });
    if (!row) return [...ownerIds];
    if (row.restaurant?.ownerUserId) ownerIds.add(row.restaurant.ownerUserId);

    const restaurantIds = new Set<string>();
    if (row.restaurantId) restaurantIds.add(row.restaurantId);
    if (Array.isArray(row.items)) {
      for (const entry of row.items) {
        if (!entry || typeof entry !== 'object') continue;
        const id = (entry as { restaurantId?: string }).restaurantId;
        if (id) restaurantIds.add(id);
      }
    }
    if (restaurantIds.size > 0) {
      const restaurants = await this.prisma.restaurant.findMany({
        where: { id: { in: [...restaurantIds] } },
        select: { ownerUserId: true },
      });
      for (const restaurant of restaurants) {
        if (restaurant.ownerUserId) ownerIds.add(restaurant.ownerUserId);
      }
    }
    return [...ownerIds];
  }
}
