import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { TrackingReferenceType } from '@prisma/client';
import {
  AdminPermission,
  assertActiveUserStatus,
  hasAdminPermission,
  INTERNAL_API_KEY,
  resolveCorsOrigin,
  serviceUrl,
  type MovaJwtPayload,
} from '@mova/shared';
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

export type SocketAuthUser = { id: string; role: string };

export function trackingGatewayCorsOptions(): { origin: boolean | string | RegExp | Array<string | RegExp>; credentials?: boolean } {
  const origin = resolveCorsOrigin();
  if (origin === false) return { origin: false };
  return { origin, credentials: true };
}

export function extractHandshakeToken(client: Socket): string | null {
  const authToken = client.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }
  const header = client.handshake.headers?.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

@WebSocketGateway({ cors: trackingGatewayCorsOptions(), namespace: '/tracking' })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private tracking: TrackingService,
    private jwt: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    const user = await this.authenticateSocket(client);
    if (!user) {
      this.logger.warn(`WS rejected (invalid JWT): ${client.id}`);
      client.disconnect(true);
      return;
    }
    client.data.user = user;
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('ping', { ts: Date.now() });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('driver:location')
  async handleDriverLocation(@ConnectedSocket() client: Socket, @MessageBody() data: { userId?: string; lat: number; lng: number; rideId?: string }) {
    return this.broadcastDriverLocation(client, data);
  }

  /** Alias mobile — même comportement que driver:location */
  @SubscribeMessage('ride:location')
  async handleRideLocation(@ConnectedSocket() client: Socket, @MessageBody() data: { userId?: string; lat: number; lng: number; rideId?: string }) {
    return this.broadcastDriverLocation(client, data);
  }

  @SubscribeMessage('courier:location')
  async handleCourierLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      userId?: string;
      lat: number;
      lng: number;
      deliveryId?: string;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    const user = this.socketUser(client);
    if (!user) return { success: false };
    await this.updateDriverCoords(client, user.id, data.lat, data.lng);
    const refType = (data.referenceType ?? (data.deliveryId ? 'DELIVERY' : undefined))?.toUpperCase();
    const refId = data.referenceId ?? data.deliveryId;
    if (refType && refId) {
      const allowed = await this.canAccessLocationReference(refType, refId, user.id);
      if (!allowed) return { success: false };
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

  private async broadcastDriverLocation(client: Socket, data: { userId?: string; lat: number; lng: number; rideId?: string }) {
    const user = this.socketUser(client);
    if (!user) return { success: false };
    if (data.rideId) {
      const allowed = await this.tracking.isRideParticipant(data.rideId, user.id);
      if (!allowed) return { success: false };
    }
    await this.updateDriverCoords(client, user.id, data.lat, data.lng);
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
    const token = extractHandshakeToken(client);
    if (!token) {
      this.logger.warn('driver location skipped: missing JWT');
      return;
    }
    try {
      const res = await fetch(serviceUrl('driver', '/drivers/location'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat, lng }),
      });
      if (!res.ok) {
        this.logger.warn(`driver location update failed: ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`driver location update error: ${err instanceof Error ? err.message : err}`);
    }
  }

  @SubscribeMessage('driver:subscribe')
  handleDriverSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.resolveSocketUserId(client);
    if (!userId) return { subscribed: false };
    client.join(`driver:${userId}`);
    return { subscribed: userId };
  }

  @SubscribeMessage('ride:subscribe')
  async handleRideSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string }) {
    const user = this.socketUser(client);
    if (!user || !data?.rideId) return { subscribed: false };
    const allowed =
      this.canObserveRide(user) || (await this.tracking.isRideParticipant(data.rideId, user.id));
    if (!allowed) return { subscribed: false };
    client.join(`ride:${data.rideId}`);
    return { subscribed: data.rideId };
  }

  @SubscribeMessage('delivery:subscribe')
  async handleDeliverySubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { deliveryId: string; lat?: number; lng?: number }) {
    const user = this.socketUser(client);
    if (!user || !data?.deliveryId) return { subscribed: false };
    const allowed =
      this.canObserveCourier(user) || (await this.tracking.canJoinCourierRoom(data.deliveryId, user.id));
    if (!allowed) return { subscribed: false };
    client.join(`delivery:${data.deliveryId}`);
    if (data.lat != null && data.lng != null) {
      const payload = { lat: data.lat, lng: data.lng, ts: Date.now() };
      client.emit('courier:location', payload);
    }
    return { subscribed: data.deliveryId };
  }

  @SubscribeMessage('ride:status')
  async handleRideStatus(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string; status: string }) {
    const user = this.socketUser(client);
    if (!user || !data?.rideId) return { broadcast: false };
    const allowed = await this.tracking.isRideParticipant(data.rideId, user.id);
    if (!allowed) return { broadcast: false };
    this.broadcastRideStatus(data.rideId, data.status);
    return { broadcast: true };
  }

  broadcastRideStatus(rideId: string, status: string) {
    this.server.to(`ride:${rideId}`).emit('ride:status', { rideId, status });
  }

  /** Push a job offer / cancel to online drivers subscribed to `driver:{userId}`. */
  broadcastDriverJob(
    driverUserIds: string[],
    event: 'ride:new' | 'ride:cancelled',
    payload: Record<string, unknown>,
  ) {
    for (const userId of driverUserIds) {
      if (!userId) continue;
      this.server.to(`driver:${userId}`).emit(event, { ...payload, ts: Date.now() });
    }
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
  async handleRideChat(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    const user = this.socketUser(client);
    if (!user || !data?.rideId || !data.text?.trim()) {
      return { ok: false };
    }
    const allowed = await this.tracking.isRideParticipant(data.rideId, user.id);
    if (!allowed) return { ok: false };
    client.join(`ride:${data.rideId}`);
    const payload = {
      rideId: data.rideId,
      senderId: user.id,
      senderRole: data.senderRole ?? user.role,
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
  async handleErrandChat(@ConnectedSocket() client: Socket, @MessageBody() data: { errandId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    const user = this.socketUser(client);
    if (!user || !data?.errandId || !data.text?.trim()) return { ok: false };
    const allowed = await this.tracking.isErrandParticipant(data.errandId, user.id);
    if (!allowed) return { ok: false };
    client.join(`errand:${data.errandId}`);
    const payload = {
      errandId: data.errandId,
      senderId: user.id,
      senderRole: data.senderRole ?? user.role,
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
  async handleDeliveryChat(@ConnectedSocket() client: Socket, @MessageBody() data: { deliveryId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    const user = this.socketUser(client);
    if (!user || !data?.deliveryId || !data.text?.trim()) return { ok: false };
    const allowed = await this.tracking.isDeliveryParticipant(data.deliveryId, user.id);
    if (!allowed) return { ok: false };
    client.join(`delivery:${data.deliveryId}`);
    const payload = {
      deliveryId: data.deliveryId,
      senderId: user.id,
      senderRole: data.senderRole ?? user.role,
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
  async handleRentalChat(@ConnectedSocket() client: Socket, @MessageBody() data: { inquiryId: string; senderId?: string; senderRole?: string; text: string; ts?: number }) {
    const user = this.socketUser(client);
    if (!user || !data?.inquiryId || !data.text?.trim()) return { ok: false };
    const allowed = await this.tracking.isRentalParticipant(data.inquiryId, user.id);
    if (!allowed) return { ok: false };
    client.join(`rental:${data.inquiryId}`);
    const payload = {
      inquiryId: data.inquiryId,
      senderId: user.id,
      senderRole: data.senderRole ?? user.role,
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
  async handleRentalSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { inquiryId: string }) {
    const user = this.socketUser(client);
    if (!user || !data?.inquiryId) return { subscribed: false };
    const allowed =
      this.canObserveCourier(user) || (await this.tracking.isRentalParticipant(data.inquiryId, user.id));
    if (!allowed) return { subscribed: false };
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

  private socketUser(client: Socket): SocketAuthUser | null {
    const user = client.data?.user as SocketAuthUser | undefined;
    if (user && typeof user.id === 'string' && user.id) return user;
    return null;
  }

  private resolveSocketUserId(client: Socket): string | null {
    return this.socketUser(client)?.id ?? null;
  }

  /** Live admin map: observe rooms only. Chat / status stay participant-only. */
  private canObserveRide(user: SocketAuthUser): boolean {
    return hasAdminPermission(user.role, AdminPermission.RIDES_READ);
  }

  private canObserveCourier(user: SocketAuthUser): boolean {
    return (
      hasAdminPermission(user.role, AdminPermission.DELIVERIES_READ) ||
      hasAdminPermission(user.role, AdminPermission.RIDES_READ)
    );
  }

  private async authenticateSocket(client: Socket): Promise<SocketAuthUser | null> {
    const token = extractHandshakeToken(client);
    if (!token) return null;
    try {
      const decoded = this.jwt.verify<MovaJwtPayload>(token);
      if (!decoded.sub) return null;
      assertActiveUserStatus(decoded.status);
      const live = await this.fetchLiveSocketUser(decoded.sub);
      if (live) {
        assertActiveUserStatus(live.status);
        return { id: live.id, role: live.role || decoded.role || '' };
      }
      return { id: decoded.sub, role: decoded.role ?? '' };
    } catch {
      return null;
    }
  }

  private async fetchLiveSocketUser(
    userId: string,
  ): Promise<{ id: string; role?: string; status?: string } | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      try {
        const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const user = (await res.json()) as { id?: string; role?: string; status?: string };
        if (!user?.id) return null;
        return { id: user.id, role: user.role, status: user.status };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  private async canAccessLocationReference(refType: string, refId: string, userId: string): Promise<boolean> {
    try {
      const type = this.tracking.normalizeType(refType);
      return this.tracking.userCanAccessReference(type, refId, userId);
    } catch {
      return this.tracking.canJoinCourierRoom(refId, userId);
    }
  }
}
