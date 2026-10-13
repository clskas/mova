import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { DeliveryChatService } from './delivery-chat.service';
import { RideChatService } from './ride-chat.service';
import { TrackingGateway } from '../websocket/tracking.gateway';

const TOKEN_TTL_SECONDS = 60 * 60;

export type LiveKitCallScope = 'delivery' | 'ride';

@Injectable()
export class DeliveryLiveKitService {
  private readonly logger = new Logger(DeliveryLiveKitService.name);
  private readonly url: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly enabled: boolean;
  private roomClient: RoomServiceClient | null = null;

  constructor(
    private deliveryChat: DeliveryChatService,
    private rideChat: RideChatService,
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

  private roomName(scope: LiveKitCallScope, id: string) {
    return `${scope}:${id}`;
  }

  private httpHost(): string {
    return this.url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
  }

  private getRoomClient(): RoomServiceClient {
    if (!this.roomClient) {
      this.roomClient = new RoomServiceClient(this.httpHost(), this.apiKey, this.apiSecret);
    }
    return this.roomClient;
  }

  /** Crée la salle côté serveur pour éviter « permission denied » au 1er join. */
  private async ensureRoom(roomName: string) {
    try {
      await this.getRoomClient().createRoom({
        name: roomName,
        emptyTimeout: 60 * 10,
        maxParticipants: 6,
      });
    } catch (e) {
      // Déjà existante ou course — le join avec roomCreate reste un filet de sécurité.
      this.logger.debug(`ensureRoom(${roomName}): ${e instanceof Error ? e.message : e}`);
    }
  }

  private async assertParticipant(scope: LiveKitCallScope, id: string, userId: string) {
    if (scope === 'ride') {
      return this.rideChat.requireParticipant(id, userId);
    }
    return this.deliveryChat.requireParticipant(id, userId);
  }

  /**
   * @param announce Si true (premier clic « Appeler »), notifie le chat + socket.
   */
  async createToken(
    scope: LiveKitCallScope,
    id: string,
    userId: string,
    opts?: { announce?: boolean },
  ) {
    if (!this.enabled) {
      throw new MovaHttpException(
        MovaErrorCode.PRICING_NOT_CONFIGURED,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Appels vocaux non configurés. Contactez le support SENGA.',
      );
    }
    const participants = await this.assertParticipant(scope, id, userId);
    const roomName = this.roomName(scope, id);
    await this.ensureRoom(roomName);

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: participants.role,
      ttl: TOKEN_TTL_SECONDS,
      metadata: JSON.stringify({ role: participants.role, scope, id }),
    });
    at.addGrant({
      roomCreate: true,
      roomJoin: true,
      room: roomName,
      roomAdmin: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });
    const token = await at.toJwt();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

    if (opts?.announce === true) {
      await this.announceCall(scope, id, userId, participants.role);
    }

    return {
      url: this.url,
      token,
      roomName,
      identity: userId,
      role: participants.role,
      scope,
      expiresAt,
    };
  }

  /** @deprecated use createToken('delivery', ...) */
  async createTokenForDelivery(deliveryId: string, userId: string, opts?: { announce?: boolean }) {
    return this.createToken('delivery', deliveryId, userId, opts);
  }

  private async announceCall(
    scope: LiveKitCallScope,
    id: string,
    starterId: string,
    starterRole: string,
  ) {
    const text = 'Appel vocal SENGA — ouvrez « Appel SENGA » pour rejoindre.';
    try {
      if (scope === 'ride') {
        await this.rideChat.sendMessage(id, starterId, text);
      } else {
        await this.deliveryChat.sendMessage(id, starterId, text);
      }
    } catch {
      /* ignore duplicate / race */
    }
    if (scope === 'ride') {
      this.trackingGateway.broadcastRideCall({
        rideId: id,
        starterId,
        starterRole,
        action: 'start',
        ts: Date.now(),
      });
    } else {
      this.trackingGateway.broadcastDeliveryCall({
        deliveryId: id,
        starterId,
        starterRole,
        action: 'start',
        ts: Date.now(),
      });
    }
  }

  async endCall(scope: LiveKitCallScope, id: string, userId: string) {
    const participants = await this.assertParticipant(scope, id, userId);
    if (scope === 'ride') {
      this.trackingGateway.broadcastRideCall({
        rideId: id,
        starterId: userId,
        starterRole: participants.role,
        action: 'end',
        ts: Date.now(),
      });
    } else {
      this.trackingGateway.broadcastDeliveryCall({
        deliveryId: id,
        starterId: userId,
        starterRole: participants.role,
        action: 'end',
        ts: Date.now(),
      });
    }
    return { ok: true };
  }
}
