import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MOVA_EVENTS,
  DeliveryCreatedPayload,
  DeliveryStatusUpdatedPayload,
  PaymentCompletedPayload,
  RideCreatedPayload,
  ServiceAssignedPayload,
  ServiceStatusUpdatedPayload,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  onModuleInit() {
    this.redis.sub.subscribe(
      MOVA_EVENTS.RIDE_CREATED,
      MOVA_EVENTS.PAYMENT_COMPLETED,
      MOVA_EVENTS.DELIVERY_CREATED,
      MOVA_EVENTS.DELIVERY_STATUS_UPDATED,
      MOVA_EVENTS.SERVICE_ASSIGNED,
      MOVA_EVENTS.SERVICE_STATUS_UPDATED,
    );
    this.redis.sub.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (channel === MOVA_EVENTS.RIDE_CREATED) await this.onRideCreated(data as RideCreatedPayload);
        if (channel === MOVA_EVENTS.PAYMENT_COMPLETED) await this.onPaymentCompleted(data as PaymentCompletedPayload);
        if (channel === MOVA_EVENTS.DELIVERY_CREATED) await this.onDeliveryCreated(data as DeliveryCreatedPayload);
        if (channel === MOVA_EVENTS.DELIVERY_STATUS_UPDATED) await this.onDeliveryStatusUpdated(data as DeliveryStatusUpdatedPayload);
        if (channel === MOVA_EVENTS.SERVICE_ASSIGNED) await this.onServiceAssigned(data as ServiceAssignedPayload);
        if (channel === MOVA_EVENTS.SERVICE_STATUS_UPDATED) await this.onServiceStatusUpdated(data as ServiceStatusUpdatedPayload);
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

  async onDeliveryCreated(payload: DeliveryCreatedPayload) {
    const label = payload.restaurantName ? ` chez ${payload.restaurantName}` : '';
    await this.create(
      payload.userId,
      'Commande confirmée',
      `Votre commande${label} est enregistrée. Le restaurant va la confirmer.`,
      'DELIVERY_CREATED',
      payload,
    );
    if (payload.restaurantOwnerUserId) {
      await this.create(
        payload.restaurantOwnerUserId,
        'Nouvelle commande repas',
        `Commande reçue${label}. Ouvrez le portail restaurant pour confirmer.`,
        'RESTAURANT_ORDER',
        payload,
      );
      this.logger.log(`restaurant order notification for ${payload.deliveryId}`);
    }
  }

  async onDeliveryStatusUpdated(payload: DeliveryStatusUpdatedPayload) {
    const body = this.deliveryStatusMessage(payload);
    if (!body) return;
    await this.create(payload.userId, 'Mise à jour commande', body, 'DELIVERY_STATUS', payload);
  }

  async onServiceAssigned(payload: ServiceAssignedPayload) {
    const label = payload.serviceType === 'MOVING' ? 'Nouveau déménagement' : 'Nouvelle course planifiée';
    const when = payload.scheduledAt ? ` · ${new Date(payload.scheduledAt).toLocaleString('fr-FR')}` : '';
    await this.create(
      payload.driverId,
      label,
      `${payload.summary}${when}`,
      'SERVICE_ASSIGNED',
      payload,
    );
    this.logger.log(`service.assigned notification for driver ${payload.driverId}`);
  }

  async onServiceStatusUpdated(payload: ServiceStatusUpdatedPayload) {
    const body = this.serviceStatusMessage(payload);
    if (!body) return;
    const title =
      payload.serviceType === 'RENTAL'
        ? 'Mise à jour location'
        : payload.serviceType === 'MOVING'
          ? 'Mise à jour déménagement'
          : 'Mise à jour course planifiée';
    await this.create(payload.userId, title, body, 'SERVICE_STATUS', payload);
  }

  private serviceStatusMessage(payload: ServiceStatusUpdatedPayload): string | null {
    if (payload.serviceType === 'RENTAL') {
      return (
        {
          PENDING: 'Votre demande de location est en attente.',
          CONTACTED: 'MOVA vous a contacté pour votre location.',
          CONFIRMED: 'Votre location est confirmée.',
          IN_PROGRESS: 'Votre location est en cours.',
          RETURNED: 'Le véhicule a été retourné.',
          CLOSED: 'Votre réservation de location a été annulée.',
        }[payload.status] ?? null
      );
    }
    if (payload.serviceType === 'MOVING') {
      return (
        {
          PENDING: 'Demande de déménagement en attente.',
          ASSIGNED: 'Un chauffeur a été assigné à votre déménagement.',
          IN_PROGRESS: 'Votre déménagement est en cours.',
          COMPLETED: 'Déménagement terminé.',
          CANCELLED: 'Déménagement annulé.',
        }[payload.status] ?? null
      );
    }
    if (payload.serviceType === 'SCHEDULED') {
      return (
        {
          SCHEDULED: 'Course planifiée enregistrée.',
          CONFIRMED: 'Votre course planifiée est confirmée.',
          IN_PROGRESS: 'Votre course planifiée est en cours.',
          COMPLETED: 'Course planifiée terminée.',
          CANCELLED: 'Course planifiée annulée.',
        }[payload.status] ?? null
      );
    }
    return null;
  }

  private deliveryStatusMessage(payload: DeliveryStatusUpdatedPayload): string | null {
    if (payload.type !== 'FOOD') return null;
    return (
      {
        PENDING: 'Commande envoyée au restaurant.',
        RESTAURANT_CONFIRMED: 'Le restaurant prépare votre repas.',
        READY_FOR_PICKUP: 'Votre commande est prête — le livreur arrive.',
        PICKED_UP: 'Le livreur a récupéré votre commande.',
        IN_TRANSIT: 'Le livreur est en route vers vous.',
        DELIVERED: 'Commande livrée. Bon appétit !',
        CANCELLED: 'Votre commande a été annulée.',
      }[payload.status] ?? null
    );
  }

  list(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }); }
  markRead(id: string) { return this.prisma.notification.update({ where: { id }, data: { read: true } }); }
}
