import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MOVA_EVENTS, PaymentCompletedPayload, RideCreatedPayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  onModuleInit() {
    this.redis.sub.subscribe(MOVA_EVENTS.RIDE_CREATED, MOVA_EVENTS.PAYMENT_COMPLETED);
    this.redis.sub.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (channel === MOVA_EVENTS.RIDE_CREATED) await this.onRideCreated(data as RideCreatedPayload);
        if (channel === MOVA_EVENTS.PAYMENT_COMPLETED) await this.onPaymentCompleted(data as PaymentCompletedPayload);
      } catch (e) {
        this.logger.error('Event handler error', e);
      }
    });
  }

  async create(userId: string, title: string, body: string, type: string, data?: object) {
    return this.prisma.notification.create({ data: { userId, title, body, type, data: data ?? {} } });
  }

  async onRideCreated(payload: RideCreatedPayload) {
    await this.create(payload.passengerId, 'Course créée', 'Recherche de chauffeur en cours dans votre zone MOVA', 'RIDE_CREATED', payload);
    this.logger.log(`ride.created notification for ${payload.rideId}`);
  }

  async onPaymentCompleted(payload: PaymentCompletedPayload) {
    await this.create(payload.userId, 'Paiement confirmé', `Paiement de ${payload.amountCdf} FC effectué`, 'PAYMENT_COMPLETED', payload);
    this.logger.log(`payment.completed notification for ride ${payload.rideId}`);
  }

  list(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }); }
  markRead(id: string) { return this.prisma.notification.update({ where: { id }, data: { read: true } }); }
}
