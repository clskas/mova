import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DeliveryCreatedPayload,
  DeliveryStatusUpdatedPayload,
  MOVA_EVENTS,
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
    const channels = [MOVA_EVENTS.DELIVERY_CREATED, MOVA_EVENTS.DELIVERY_STATUS_UPDATED];
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
        if (!payload.restaurantOwnerUserId) return;
        this.gateway.broadcastRestaurantEvent(payload.restaurantOwnerUserId, {
          type: 'order',
          deliveryId: payload.deliveryId,
          status: 'PENDING',
        });
        return;
      }
      if (channel === MOVA_EVENTS.DELIVERY_STATUS_UPDATED) {
        const payload = JSON.parse(message) as DeliveryStatusUpdatedPayload;
        const ownerUserId =
          payload.restaurantOwnerUserId ?? (await this.resolveRestaurantOwnerUserId(payload.deliveryId));
        if (!ownerUserId) return;
        this.gateway.broadcastRestaurantEvent(ownerUserId, {
          type: 'order-status',
          deliveryId: payload.deliveryId,
          status: payload.status,
        });
      }
    } catch (e) {
      this.logger.warn('Restaurant portal event handler error', e);
    }
  }

  private async resolveRestaurantOwnerUserId(deliveryId: string): Promise<string | null> {
    const row = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { restaurant: { select: { ownerUserId: true } } },
    });
    return row?.restaurant?.ownerUserId ?? null;
  }
}
