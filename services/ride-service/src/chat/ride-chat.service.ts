import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

export type RideChatSenderRole = 'passenger' | 'driver';

export interface RideChatMessage {
  rideId: string;
  senderId: string;
  senderRole: RideChatSenderRole;
  text: string;
  ts: number;
}

@Injectable()
export class RideChatService {
  private readonly messages = new Map<string, RideChatMessage[]>();

  constructor(
    private prisma: PrismaService,
    private trackingGateway: TrackingGateway,
  ) {}

  private async assertParticipant(rideId: string, userId: string): Promise<RideChatSenderRole> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: { passengerId: true, driverId: true },
    });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId === userId) return 'passenger';
    if (ride.driverId === userId) return 'driver';
    throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
  }

  async listMessages(rideId: string, userId: string) {
    await this.assertParticipant(rideId, userId);
    const messages = this.messages.get(rideId) ?? [];
    return { rideId, messages };
  }

  async sendMessage(rideId: string, userId: string, text: string) {
    const senderRole = await this.assertParticipant(rideId, userId);
    const trimmed = text.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);

    const payload: RideChatMessage = {
      rideId,
      senderId: userId,
      senderRole,
      text: trimmed,
      ts: Date.now(),
    };
    const list = this.messages.get(rideId) ?? [];
    list.push(payload);
    if (list.length > 200) list.splice(0, list.length - 200);
    this.messages.set(rideId, list);
    this.trackingGateway.broadcastRideChat(payload);
    return payload;
  }
}
