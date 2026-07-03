import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

export type ErrandChatSenderRole = 'passenger' | 'driver';

export interface ErrandChatMessage {
  id: string;
  errandId: string;
  senderId: string;
  senderRole: ErrandChatSenderRole;
  text: string;
  ts: number;
}

@Injectable()
export class ErrandChatService {
  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  private async assertParticipant(errandId: string, userId: string): Promise<ErrandChatSenderRole> {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: errandId },
      select: { userId: true, driverId: true },
    });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!order.driverId) {
      throw new MovaHttpException(
        MovaErrorCode.ERRAND_INVALID_STATUS,
        HttpStatus.BAD_REQUEST,
        'Le chat est disponible une fois le livreur assigné.',
      );
    }
    if (order.userId === userId) return 'passenger';
    if (order.driverId === userId) return 'driver';
    throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
  }

  private toPayload(row: {
    id: string;
    errandId: string;
    senderId: string;
    senderRole: string;
    text: string;
    ts: bigint;
  }): ErrandChatMessage {
    return {
      id: row.id,
      errandId: row.errandId,
      senderId: row.senderId,
      senderRole: row.senderRole as ErrandChatSenderRole,
      text: row.text,
      ts: Number(row.ts),
    };
  }

  async listMessages(errandId: string, userId: string) {
    await this.assertParticipant(errandId, userId);
    const rows = await this.prisma.errandChatMessage.findMany({
      where: { errandId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return { errandId, messages: rows.map((r) => this.toPayload(r)) };
  }

  async sendMessage(errandId: string, userId: string, text: string) {
    const senderRole = await this.assertParticipant(errandId, userId);
    const trimmed = text.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);

    const ts = Date.now();
    const row = await this.prisma.errandChatMessage.create({
      data: { errandId, senderId: userId, senderRole, text: trimmed, ts: BigInt(ts) },
    });
    const payload = this.toPayload(row);
    this.trackingGateway.broadcastErrandChat(payload);
    return payload;
  }
}
