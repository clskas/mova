import { HttpStatus, Injectable } from '@nestjs/common';
import { MOVA_EVENTS, MovaErrorCode, MovaHttpException, RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

export type RentalChatSenderRole = 'passenger' | 'driver' | 'partner';

interface RentalParticipants {
  role: RentalChatSenderRole;
  passengerId: string | null;
  driverId: string | null;
  partnerId: string | null;
}

export interface RentalChatMessage {
  id: string;
  inquiryId: string;
  senderId: string;
  senderRole: RentalChatSenderRole;
  text: string;
  ts: number;
}

@Injectable()
export class RentalChatService {
  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
    private redis: RedisService,
  ) {}

  private async assertParticipant(inquiryId: string, userId: string): Promise<RentalParticipants> {
    const inquiry = await this.prisma.rentalInquiry.findUnique({
      where: { id: inquiryId },
      select: { userId: true, driverId: true, vehicle: { select: { ownerUserId: true } } },
    });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const base = {
      passengerId: inquiry.userId,
      driverId: inquiry.driverId,
      partnerId: inquiry.vehicle?.ownerUserId ?? null,
    };
    if (inquiry.userId === userId) return { role: 'passenger', ...base };
    if (inquiry.driverId === userId) return { role: 'driver', ...base };
    if (inquiry.vehicle?.ownerUserId === userId) return { role: 'partner', ...base };
    throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
  }

  private toPayload(row: {
    id: string;
    inquiryId: string;
    senderId: string;
    senderRole: string;
    text: string;
    ts: bigint;
  }): RentalChatMessage {
    return {
      id: row.id,
      inquiryId: row.inquiryId,
      senderId: row.senderId,
      senderRole: row.senderRole as RentalChatSenderRole,
      text: row.text,
      ts: Number(row.ts),
    };
  }

  async listMessages(inquiryId: string, userId: string) {
    await this.assertParticipant(inquiryId, userId);
    const rows = await this.prisma.rentalChatMessage.findMany({
      where: { inquiryId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return { inquiryId, messages: rows.map((r) => this.toPayload(r)) };
  }

  async sendMessage(inquiryId: string, userId: string, text: string) {
    const participants = await this.assertParticipant(inquiryId, userId);
    const senderRole = participants.role;
    const trimmed = text.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);

    const ts = Date.now();
    const row = await this.prisma.rentalChatMessage.create({
      data: { inquiryId, senderId: userId, senderRole, text: trimmed, ts: BigInt(ts) },
    });
    const payload = this.toPayload(row);
    this.trackingGateway.broadcastRentalChat(payload);

    const recipientIds = [participants.passengerId, participants.driverId, participants.partnerId]
      .filter((id): id is string => !!id && id !== userId);
    void this.redis
      .publish(MOVA_EVENTS.CHAT_MESSAGE, {
        kind: 'rental',
        threadId: inquiryId,
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
