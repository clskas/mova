import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/tracking' })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TrackingGateway.name);

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

  private async broadcastDriverLocation(client: Socket, data: { userId: string; lat: number; lng: number; rideId?: string }) {
    if (data.userId) {
      await fetch(serviceUrl('driver', '/drivers/location'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.handshake.auth?.token ?? ''}` },
        body: JSON.stringify({ lat: data.lat, lng: data.lng }),
      }).catch(() =>
        fetch(serviceUrl('driver', `/internal/drivers/${data.userId}/location`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
          body: JSON.stringify({ lat: data.lat, lng: data.lng }),
        }),
      );
    }
    const payload = { lat: data.lat, lng: data.lng, ts: Date.now() };
    if (data.rideId) {
      this.server.to(`ride:${data.rideId}`).emit('driver:location', payload);
      this.server.to(`ride:${data.rideId}`).emit('ride:location', payload);
    }
    return { success: true };
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
    return { subscribed: data.deliveryId, mode: 'mock' };
  }

  @SubscribeMessage('ride:status')
  handleRideStatus(@MessageBody() data: { rideId: string; status: string }) {
    this.broadcastRideStatus(data.rideId, data.status);
    return { broadcast: true };
  }

  broadcastRideStatus(rideId: string, status: string) {
    this.server.to(`ride:${rideId}`).emit('ride:status', { rideId, status });
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
    this.server.to(`ride:${data.rideId}`).emit('ride:chat', payload);
    return { ok: true };
  }
}
