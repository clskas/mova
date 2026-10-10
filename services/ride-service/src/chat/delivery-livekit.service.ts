import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { DeliveryChatService } from './delivery-chat.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

const TOKEN_TTL_SECONDS = 60 * 60;

@Injectable()
export class DeliveryLiveKitService {
  private readonly logger = new Logger(DeliveryLiveKitService.name);
  private readonly url: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly enabled: boolean;

  constructor(
    private chat: DeliveryChatService,
    private trackingGateway: TrackingGateway,
  ) {
    this.url = (process.env.LIVEKIT_URL ?? '').trim();
    this.apiKey = (process.env.LIVEKIT_API_KEY ?? '').trim();
    this.apiSecret = (process.env.LIVEKIT_API_SECRET ?? '').trim();
    this.enabled =
      this.url.length > 0 &&
      this.apiKey.length > 0 &&
      this.apiSecret.length > 0 &&
      process.env.LIVEKIT_ENABLED !== 'false';
    if (!this.enabled) {
      this.logger.log('LiveKit voice calls disabled (LIVEKIT_URL / API_KEY / API_SECRET missing).');
    }
  }

  isConfigured(): boolean {
    return this.enabled;
  }

  status() {
    return { enabled: this.enabled };
  }

  private roomName(deliveryId: string) {
    return `delivery:${deliveryId}`;
  }

  /**
   * @param announce Si true (premier clic « Appeler »), notifie le chat + socket.
   */
  async createToken(deliveryId: string, userId: string, opts?: { announce?: boolean }) {
    if (!this.enabled) {
      throw new MovaHttpException(
        MovaErrorCode.PRICING_NOT_CONFIGURED,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Appels vocaux non configurés. Contactez le support SENGA.',
      );
    }
    const participants = await this.chat.requireParticipant(deliveryId, userId);
    const roomName = this.roomName(deliveryId);
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: participants.role,
      ttl: TOKEN_TTL_SECONDS,
      metadata: JSON.stringify({ role: participants.role, deliveryId }),
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

    if (opts?.announce === true) {
      await this.announceCall(deliveryId, userId, participants.role);
    }

    return {
      url: this.url,
      token,
      roomName,
      identity: userId,
      role: participants.role,
      expiresAt,
    };
  }

  private async announceCall(deliveryId: string, starterId: string, starterRole: string) {
    const text = 'Appel vocal SENGA — ouvrez « Appeler » pour rejoindre.';
    try {
      await this.chat.sendMessage(deliveryId, starterId, text);
    } catch {
      /* ignore duplicate / race */
    }
    this.trackingGateway.broadcastDeliveryCall({
      deliveryId,
      starterId,
      starterRole,
      action: 'start',
      ts: Date.now(),
    });
  }
}
