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

  private async assertParticipant(deliveryId: string, userId: string): Promise<DeliveryChatSenderRole> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { userId: true, driverId: true, restaurant: { select: { ownerUserId: true } } },
    });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.userId === userId) return 'passenger';
    if (delivery.driverId === userId) return 'driver';
    if (delivery.restaurant?.ownerUserId === userId) return 'partner';
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
