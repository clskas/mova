import { HttpStatus, Injectable } from '@nestjs/common';
import { MOVA_EVENTS, MovaErrorCode, MovaHttpException, RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

export type DeliveryChatSenderRole = 'passenger' | 'driver' | 'partner';

interface DeliveryParticipants {
  role: DeliveryChatSenderRole;
  passengerId: string | null;
  driverId: string | null;
  partnerId: string | null;
}

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
    private redis: RedisService,
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

  private async assertParticipant(deliveryId: string, userId: string): Promise<DeliveryParticipants> {
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
    const base = {
      passengerId: delivery.userId,
      driverId: delivery.driverId,
      partnerId: delivery.restaurant?.ownerUserId ?? null,
    };
    if (delivery.userId === userId) return { role: 'passenger', ...base };
    if (delivery.driverId === userId) return { role: 'driver', ...base };
    const partnerRole = await this.resolvePartnerRole(delivery, userId);
    if (partnerRole) return { role: partnerRole, ...base, partnerId: base.partnerId ?? userId };
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
    const participants = await this.assertParticipant(deliveryId, userId);
    const senderRole = participants.role;
    const trimmed = text.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);

    const ts = Date.now();
    const row = await this.prisma.deliveryChatMessage.create({
      data: { deliveryId, senderId: userId, senderRole, text: trimmed, ts: BigInt(ts) },
    });
    const payload = this.toPayload(row);
    this.trackingGateway.broadcastDeliveryChat(payload);

    const recipientIds = [participants.passengerId, participants.driverId, participants.partnerId]
      .filter((id): id is string => !!id && id !== userId);
    void this.redis
      .publish(MOVA_EVENTS.CHAT_MESSAGE, {
        kind: 'delivery',
        threadId: deliveryId,
        messageId: row.id,
        senderId: userId,
        senderRole,
        recipientIds,
        text: trimmed,
      })
      .catch(() => undefined);

    return payload;
  }
}
