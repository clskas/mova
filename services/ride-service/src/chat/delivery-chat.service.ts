import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

export type DeliveryChatSenderRole = 'passenger' | 'driver' | 'partner';

export interface DeliveryChatMessage {
  id: string;
  deliveryId: string;
  senderId: string;
  senderRole: DeliveryChatSenderRole;
  text: string;
  ts: number;
}

@Injectable()
export class DeliveryChatService {
  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  private deliveryIncludesRestaurant(items: unknown, restaurantId: string): boolean {
    if (!Array.isArray(items)) return false;
    return items.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return (entry as { restaurantId?: string }).restaurantId === restaurantId;
    });
  }

  private async resolvePartnerRole(
    delivery: {
      restaurantId: string | null;
      items: unknown;
      restaurant?: { ownerUserId: string | null } | null;
    },
    userId: string,
  ): Promise<'partner' | null> {
    if (delivery.restaurant?.ownerUserId === userId) return 'partner';

    const ownedRestaurants = await this.prisma.restaurant.findMany({
      where: { ownerUserId: userId, isActive: true },
      select: { id: true },
    });
    if (!ownedRestaurants.length) return null;

    for (const restaurant of ownedRestaurants) {
      if (delivery.restaurantId === restaurant.id) return 'partner';
      if (this.deliveryIncludesRestaurant(delivery.items, restaurant.id)) return 'partner';
    }
    return null;
  }

  private async assertParticipant(deliveryId: string, userId: string): Promise<DeliveryChatSenderRole> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        userId: true,
        driverId: true,
        restaurantId: true,
        items: true,
        restaurant: { select: { ownerUserId: true } },
      },
    });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.userId === userId) return 'passenger';
    if (delivery.driverId === userId) return 'driver';
    const partnerRole = await this.resolvePartnerRole(delivery, userId);
    if (partnerRole) return partnerRole;
    throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
  }

  private toPayload(row: {
    id: string;
    deliveryId: string;
    senderId: string;
    senderRole: string;
    text: string;
    ts: bigint;
  }): DeliveryChatMessage {
    return {
      id: row.id,
      deliveryId: row.deliveryId,
      senderId: row.senderId,
      senderRole: row.senderRole as DeliveryChatSenderRole,
      text: row.text,
      ts: Number(row.ts),
    };
  }

  async listMessages(deliveryId: string, userId: string) {
    await this.assertParticipant(deliveryId, userId);
    const rows = await this.prisma.deliveryChatMessage.findMany({
      where: { deliveryId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return { deliveryId, messages: rows.map((r) => this.toPayload(r)) };
  }

  async sendMessage(deliveryId: string, userId: string, text: string) {
    const senderRole = await this.assertParticipant(deliveryId, userId);
    const trimmed = text.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);

    const ts = Date.now();
    const row = await this.prisma.deliveryChatMessage.create({
      data: { deliveryId, senderId: userId, senderRole, text: trimmed, ts: BigInt(ts) },
    });
    const payload = this.toPayload(row);
    this.trackingGateway.broadcastDeliveryChat(payload);
    return payload;
  }
}
