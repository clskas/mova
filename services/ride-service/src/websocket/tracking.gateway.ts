import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { TrackingReferenceType } from '@prisma/client';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { TrackingService } from '../tracking/tracking.service';

export type PartnerRentalLivePayload = {
  type: 'rental' | 'booking-status';
  kind?: string;
  inquiryId: string;
  status: string;
};

export type PartnerVehicleLivePayload = {
  vehicleId: string;
  action: 'created' | 'updated' | 'deleted' | 'reviewed';
  approvalStatus?: string;
  isActive?: boolean;
};

export type RestaurantLivePayload = {
  type: 'order' | 'order-status' | 'order-payment';
  deliveryId: string;
  status: string;
  isPaid?: boolean;
  paymentStatus?: string | null;
};

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/tracking' })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private tracking: TrackingService,
    private jwt: JwtService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('ping', { ts: Date.now() });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('driver:location')
  async handleDriverLocation(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string; lat: number; lng: number; rideId?: string }) {
    return this.broadcastDriverLocation(client, data);
  }

  /** Alias mobile — même comportement que driver:location */
  @SubscribeMessage('ride:location')
  async handleRideLocation(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string; lat: number; lng: number; rideId?: string }) {
    return this.broadcastDriverLocation(client, data);
  }

  @SubscribeMessage('courier:location')
  async handleCourierLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      userId: string;
      lat: number;
      lng: number;
      deliveryId?: string;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    await this.updateDriverCoords(client, data.userId, data.lat, data.lng);
    const refType = (data.referenceType ?? (data.deliveryId ? 'DELIVERY' : undefined))?.toUpperCase();
    const refId = data.referenceId ?? data.deliveryId;
    if (refType && refId) {
      try {
        await this.tracking.recordPoint(this.tracking.normalizeType(refType), refId, data.lat, data.lng);
      } catch {
        /* type inconnu */
      }
    }
    const payload = { lat: data.lat, lng: data.lng, ts: Date.now() };
    if (refId) {
      this.server.to(`delivery:${refId}`).emit('courier:location', payload);
    }
    return { success: true };
  }

  private async broadcastDriverLocation(client: Socket, data: { userId: string; lat: number; lng: number; rideId?: string }) {
    await this.updateDriverCoords(client, data.userId, data.lat, data.lng);
    if (data.rideId) {
      await this.tracking.recordPoint(TrackingReferenceType.RIDE, data.rideId, data.lat, data.lng);
    }
    const payload = { lat: data.lat, lng: data.lng, ts: Date.now() };
    if (data.rideId) {
      this.server.to(`ride:${data.rideId}`).emit('driver:location', payload);
      this.server.to(`ride:${data.rideId}`).emit('ride:location', payload);
    }
    return { success: true };
  }

  private async updateDriverCoords(client: Socket, userId: string, lat: number, lng: number) {
    if (!userId) return;
    await fetch(serviceUrl('driver', '/drivers/location'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.handshake.auth?.token ?? ''}` },
      body: JSON.stringify({ lat, lng }),
    }).catch(() =>
      fetch(serviceUrl('driver', `/internal/drivers/${userId}/location`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ lat, lng }),
      }),
    );
  }

  @SubscribeMessage('driver:subscribe')
  handleDriverSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
    if (data.userId) {
      client.join(`driver:${data.userId}`);
    }
    return { subscribed: data.userId };
  }

  @SubscribeMessage('ride:subscribe')
  handleRideSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string }) {
    client.join(`ride:${data.rideId}`);
    return { subscribed: data.rideId };
  }

  @SubscribeMessage('delivery:subscribe')
  handleDeliverySubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { deliveryId: string; lat?: number; lng?: number }) {
    client.join(`delivery:${data.deliveryId}`);
    if (data.lat != null && data.lng != null) {
      const payload = { lat: data.lat, lng: data.lng, ts: Date.now() };
      client.emit('courier:location', payload);
      this.server.to(`delivery:${data.deliveryId}`).emit('courier:location', payload);
    }
    return { subscribed: data.deliveryId };
  }

  @SubscribeMessage('ride:status')
  handleRideStatus(@MessageBody() data: { rideId: string; status: string }) {
    this.broadcastRideStatus(data.rideId, data.status);
    return { broadcast: true };
  }

  broadcastRideStatus(rideId: string, status: string) {
    this.server.to(`ride:${rideId}`).emit('ride:status', { rideId, status });
  }

  /** Notifie la room de la course qu'un paiement espèces est en attente de confirmation PIN. */
  broadcastRideCashPending(rideId: string, payload: { amountCdf?: number }) {
    const adapter = (this.server as unknown as { adapter?: { rooms?: Map<string, Set<string>> } }).adapter;
    const clients = adapter?.rooms?.get(`ride:${rideId}`)?.size ?? 0;
    this.logger.log(`emit ride:cash-pending to room ride:${rideId} (${clients} client(s))`);
    this.server.to(`ride:${rideId}`).emit('ride:cash-pending', { rideId, ...payload, ts: Date.now() });
  }

  broadcastDeliveryCashPending(
    deliveryId: string,
    payload: { amountCdf?: number; referenceType?: string; driverId?: string },
  ) {
    const adapter = (this.server as unknown as { adapter?: { rooms?: Map<string, Set<string>> } }).adapter;
    const clients = adapter?.rooms?.get(`delivery:${deliveryId}`)?.size ?? 0;
    this.logger.log(`emit delivery:cash-pending to room delivery:${deliveryId} (${clients} client(s))`);
    const eventPayload = {
      deliveryId,
      referenceType: payload.referenceType ?? 'DELIVERY',
      amountCdf: payload.amountCdf,
      ts: Date.now(),
    };
    this.server.to(`delivery:${deliveryId}`).emit('delivery:cash-pending', eventPayload);
    if (payload.driverId) {
      const driverClients = adapter?.rooms?.get(`driver:${payload.driverId}`)?.size ?? 0;
      this.logger.log(`emit delivery:cash-pending to room driver:${payload.driverId} (${driverClients} client(s))`);
      this.server.to(`driver:${payload.driverId}`).emit('delivery:cash-pending', eventPayload);
    }
  }

  broadcastDeliveryPaymentCompleted(
    deliveryId: string,
    payload: { isPaid?: boolean; paymentStatus?: string; method?: string },
  ) {
    const adapter = (this.server as unknown as { adapter?: { rooms?: Map<string, Set<string>> } }).adapter;
    const clients = adapter?.rooms?.get(`delivery:${deliveryId}`)?.size ?? 0;
    this.logger.log(`emit delivery:payment-completed to room delivery:${deliveryId} (${clients} client(s))`);
    this.server.to(`delivery:${deliveryId}`).emit('delivery:payment-completed', {
      deliveryId,
      isPaid: payload.isPaid ?? true,
      paymentStatus: payload.paymentStatus ?? 'COMPLETED',
      method: payload.method,
      ts: Date.now(),
    });
  }

  broadcastRidePaymentCompleted(
    rideId: string,
    payload: { isPaid?: boolean; paymentStatus?: string; method?: string },
  ) {
    const adapter = (this.server as unknown as { adapter?: { rooms?: Map<string, Set<string>> } }).adapter;
    const clients = adapter?.rooms?.get(`ride:${rideId}`)?.size ?? 0;
    this.logger.log(`emit ride:payment-completed to room ride:${rideId} (${clients} client(s))`);
    this.server.to(`ride:${rideId}`).emit('ride:payment-completed', {
      rideId,
      isPaid: payload.isPaid ?? true,
      paymentStatus: payload.paymentStatus ?? 'COMPLETED',
      method: payload.method,
      ts: Date.now(),
    });
  }

  @SubscribeMessage('ride:chat')
  handleRideChat(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    if (!data?.rideId || !data.text?.trim()) {
      return { ok: false };
    }
    client.join(`ride:${data.rideId}`);
    const payload = {
      rideId: data.rideId,
      senderId: data.senderId ?? 'unknown',
      senderRole: data.senderRole ?? 'unknown',
      text: data.text.trim(),
      ts: data.ts ?? Date.now(),
    };
    this.broadcastRideChat(payload);
    return { ok: true };
  }

  broadcastRideChat(payload: { rideId: string; senderId: string; senderRole: string; text: string; ts: number }) {
    this.server.to(`ride:${payload.rideId}`).emit('ride:chat', payload);
  }

  @SubscribeMessage('errand:chat')
  handleErrandChat(@ConnectedSocket() client: Socket, @MessageBody() data: { errandId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    if (!data?.errandId || !data.text?.trim()) return { ok: false };
    client.join(`errand:${data.errandId}`);
    const payload = {
      errandId: data.errandId,
      senderId: data.senderId ?? 'unknown',
      senderRole: data.senderRole ?? 'unknown',
      text: data.text.trim(),
      ts: data.ts ?? Date.now(),
    };
    this.broadcastErrandChat(payload);
    return { ok: true };
  }

  broadcastErrandChat(payload: { errandId: string; senderId: string; senderRole: string; text: string; ts: number }) {
    this.server.to(`errand:${payload.errandId}`).emit('errand:chat', payload);
  }

  @SubscribeMessage('delivery:chat')
  handleDeliveryChat(@ConnectedSocket() client: Socket, @MessageBody() data: { deliveryId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    if (!data?.deliveryId || !data.text?.trim()) return { ok: false };
    client.join(`delivery:${data.deliveryId}`);
    const payload = {
      deliveryId: data.deliveryId,
      senderId: data.senderId ?? 'unknown',
      senderRole: data.senderRole ?? 'unknown',
      text: data.text.trim(),
      ts: data.ts ?? Date.now(),
    };
    this.broadcastDeliveryChat(payload);
    return { ok: true };
  }

  broadcastDeliveryChat(payload: { deliveryId: string; senderId: string; senderRole: string; text: string; ts: number }) {
    this.server.to(`delivery:${payload.deliveryId}`).emit('delivery:chat', payload);
  }

  @SubscribeMessage('rental:chat')
  handleRentalChat(@ConnectedSocket() client: Socket, @MessageBody() data: { inquiryId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    if (!data?.inquiryId || !data.text?.trim()) return { ok: false };
    client.join(`rental:${data.inquiryId}`);
    const payload = {
      inquiryId: data.inquiryId,
      senderId: data.senderId ?? 'unknown',
      senderRole: data.senderRole ?? 'unknown',
      text: data.text.trim(),
      ts: data.ts ?? Date.now(),
    };
    this.broadcastRentalChat(payload);
    return { ok: true };
  }

  broadcastRentalChat(payload: { inquiryId: string; senderId: string; senderRole: string; text: string; ts: number }) {
    this.server.to(`rental:${payload.inquiryId}`).emit('rental:chat', payload);
  }

  @SubscribeMessage('rental:subscribe')
  handleRentalSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { inquiryId: string }) {
    if (!data?.inquiryId) return { subscribed: false };
    client.join(`rental:${data.inquiryId}`);
    return { subscribed: data.inquiryId };
  }

  @SubscribeMessage('partner:subscribe')
  handlePartnerSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.resolveSocketUserId(client);
    if (!userId) return { subscribed: false };
    client.join(`partner:${userId}`);
    return { subscribed: true, userId };
  }

  broadcastPartnerRentalEvent(ownerUserId: string, payload: PartnerRentalLivePayload) {
    this.server.to(`partner:${ownerUserId}`).emit('partner:rental', payload);
  }

  broadcastPartnerVehicleEvent(ownerUserId: string, payload: PartnerVehicleLivePayload) {
    this.server.to(`partner:${ownerUserId}`).emit('partner:vehicle', payload);
  }

  @SubscribeMessage('restaurant:subscribe')
  handleRestaurantSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.resolveSocketUserId(client);
    if (!userId) return { subscribed: false };
    client.join(`restaurant:${userId}`);
    return { subscribed: true, userId };
  }

  broadcastRestaurantEvent(ownerUserId: string, payload: RestaurantLivePayload) {
    this.server.to(`restaurant:${ownerUserId}`).emit('restaurant:order', payload);
  }

  private resolveSocketUserId(client: Socket): string | null {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || !token.trim()) return null;
    try {
      const decoded = this.jwt.verify<{ sub?: string }>(token);
      return decoded.sub ?? null;
    } catch {
      return null;
    }
  }
}
