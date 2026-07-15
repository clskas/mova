import { HttpStatus, Injectable } from '@nestjs/common';
import { MOVA_EVENTS, MovaErrorCode, MovaHttpException, RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

export type RideChatSenderRole = 'passenger' | 'driver';

interface RideParticipants {
  role: RideChatSenderRole;
  passengerId: string;
  driverId: string;
}

export interface RideChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: RideChatSenderRole;
  text: string;
  ts: number;
}

@Injectable()
export class RideChatService {
  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
    private redis: RedisService,
  ) {}

  private async assertParticipant(rideId: string, userId: string): Promise<RideParticipants> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: { passengerId: true, driverId: true },
    });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!ride.driverId) {
      throw new MovaHttpException(
        MovaErrorCode.RIDE_INVALID_STATUS,
        HttpStatus.BAD_REQUEST,
        'Le chat est disponible une fois le chauffeur assigné.',
      );
    }
    const base = { passengerId: ride.passengerId, driverId: ride.driverId };
    if (ride.passengerId === userId) return { role: 'passenger', ...base };
    if (ride.driverId === userId) return { role: 'driver', ...base };
    throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
  }

  private toPayload(row: {
    id: string;
    rideId: string;
    senderId: string;
    senderRole: string;
    text: string;
    ts: bigint;
  }): RideChatMessage {
    return {
      id: row.id,
      rideId: row.rideId,
      senderId: row.senderId,
      senderRole: row.senderRole as RideChatSenderRole,
      text: row.text,
      ts: Number(row.ts),
    };
  }

  async listMessages(rideId: string, userId: string) {
    await this.assertParticipant(rideId, userId);
    const rows = await this.prisma.rideChatMessage.findMany({
      where: { rideId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const messages = rows.map((r) => this.toPayload(r));
    return { rideId, messages };
  }

  async sendMessage(rideId: string, userId: string, text: string) {
    const participants = await this.assertParticipant(rideId, userId);
    const senderRole = participants.role;
    const trimmed = text.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);

    const ts = Date.now();
    const row = await this.prisma.rideChatMessage.create({
      data: {
        rideId,
        senderId: userId,
        senderRole,
        text: trimmed,
        ts: BigInt(ts),
      },
    });
    const payload = this.toPayload(row);
    this.trackingGateway.broadcastRideChat(payload);

    // Notifie le destinataire (l'autre participant) même hors écran chat : le
    // notification-service crée une notification in-app et pousse aux chauffeurs.
    const recipientId =
      senderRole === 'passenger' ? participants.driverId : participants.passengerId;
    void this.redis
      .publish(MOVA_EVENTS.CHAT_MESSAGE, {
        kind: 'ride',
        threadId: rideId,
        messageId: row.id,
        senderId: userId,
        senderRole,
        recipientIds: [recipientId],
        text: trimmed,
      })
      .catch(() => undefined);

    return payload;
  }
}
