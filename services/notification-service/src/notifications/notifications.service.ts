import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MOVA_EVENTS,
  DeliveryCreatedPayload,
  DeliveryStatusUpdatedPayload,
  DriverJobAlertPayload,
  IncidentCreatedPayload,
  PaymentCompletedPayload,
  RentalBookingPayload,
  RideCreatedPayload,
  RideStatusSmsPayload,
  ServiceAssignedPayload,
  ServiceStatusUpdatedPayload,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { FcmPushService } from '../push/fcm-push.service';
import { PushTokensService } from '../push/push-tokens.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private sms: SmsService,
    private fcm: FcmPushService,
    private pushTokens: PushTokensService,
  ) {}

  onModuleInit() {
    const channels = [
      MOVA_EVENTS.RIDE_CREATED,
      MOVA_EVENTS.PAYMENT_COMPLETED,
      MOVA_EVENTS.DELIVERY_CREATED,
      MOVA_EVENTS.DELIVERY_STATUS_UPDATED,
      MOVA_EVENTS.SERVICE_ASSIGNED,
      MOVA_EVENTS.SERVICE_STATUS_UPDATED,
      MOVA_EVENTS.RENTAL_BOOKING,
      MOVA_EVENTS.INCIDENT_CREATED,
      MOVA_EVENTS.RIDE_STATUS_SMS,
      MOVA_EVENTS.DRIVER_JOB_ALERT,
    ];
    this.redis.sub.subscribe(...channels, (err) => {
      if (err) {
        this.logger.warn(`Redis subscribe unavailable: ${err.message}`);
        return;
      }
      this.logger.log(`Subscribed to ${channels.length} MOVA event channels`);
    });
    this.redis.sub.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (channel === MOVA_EVENTS.RIDE_CREATED) await this.onRideCreated(data as RideCreatedPayload);
        if (channel === MOVA_EVENTS.PAYMENT_COMPLETED) await this.onPaymentCompleted(data as PaymentCompletedPayload);
        if (channel === MOVA_EVENTS.DELIVERY_CREATED) await this.onDeliveryCreated(data as DeliveryCreatedPayload);
        if (channel === MOVA_EVENTS.DELIVERY_STATUS_UPDATED) await this.onDeliveryStatusUpdated(data as DeliveryStatusUpdatedPayload);
        if (channel === MOVA_EVENTS.SERVICE_ASSIGNED) await this.onServiceAssigned(data as ServiceAssignedPayload);
        if (channel === MOVA_EVENTS.SERVICE_STATUS_UPDATED) await this.onServiceStatusUpdated(data as ServiceStatusUpdatedPayload);
        if (channel === MOVA_EVENTS.RENTAL_BOOKING) await this.onRentalBooking(data as RentalBookingPayload);
        if (channel === MOVA_EVENTS.INCIDENT_CREATED) await this.onIncidentCreated(data as IncidentCreatedPayload);
        if (channel === MOVA_EVENTS.RIDE_STATUS_SMS) await this.onRideStatusSms(data as RideStatusSmsPayload);
        if (channel === MOVA_EVENTS.DRIVER_JOB_ALERT) await this.onDriverJobAlert(data as DriverJobAlertPayload);
      } catch (e) {
        this.logger.error('Event handler error', e);
      }
    });
  }

  private async pushToDrivers(userIds: string[], title: string, body: string, data?: Record<string, string>) {
    if (!this.fcm.isConfigured() || userIds.length === 0) return;
    const tokens = await this.pushTokens.tokensForUsers(userIds);
    if (tokens.length === 0) return;
    await this.fcm.sendToTokens(tokens, { title, body, data });
  }

  async create(userId: string, title: string, body: string, type: string, data?: object) {
    return this.prisma.notification.create({ data: { userId, title, body, type, data: data ?? {} } });
  }

  async onRideCreated(payload: RideCreatedPayload) {
    await this.create(payload.passengerId, 'Course créée', 'Recherche de chauffeur en cours dans votre zone MOVA', 'RIDE_CREATED', payload);
    this.logger.log(`ride.created notification for ${payload.rideId}`);
  }

  async onPaymentCompleted(payload: PaymentCompletedPayload) {
    const label = payload.rideId ? `course ${payload.rideId}` : `${payload.referenceType} ${payload.referenceId}`;
    await this.create(payload.userId, 'Paiement confirmé', `Paiement de ${payload.amountCdf} FC effectué (${label})`, 'PAYMENT_COMPLETED', payload);
    this.logger.log(`payment.completed notification for ${payload.rideId ?? payload.referenceId}`);
  }

  async onIncidentCreated(payload: IncidentCreatedPayload) {
    const title = payload.isEmergency || payload.type === 'SOS' ? '🚨 Alerte SOS' : 'Nouvel incident';
    await this.create(payload.userId, title, 'Votre signalement a été transmis à l\'équipe MOVA.', 'INCIDENT_CREATED', payload);
    this.logger.warn(`incident.created ${payload.incidentId} type=${payload.type} emergency=${payload.isEmergency}`);
  }

  async onRideStatusSms(payload: RideStatusSmsPayload) {
    await this.sms.sendMessage(payload.phone, payload.message);
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
    const label =
      payload.serviceType === 'RENTAL'
        ? 'Mission logistique location'
        : payload.serviceType === 'MOVING'
          ? 'Nouveau déménagement'
          : payload.serviceType === 'ERRAND'
            ? 'Nouvelle course & commissions'
            : 'Nouvelle course planifiée';
    const when = payload.scheduledAt ? ` · ${new Date(payload.scheduledAt).toLocaleString('fr-FR')}` : '';
    await this.create(
      payload.driverId,
      label,
      `${payload.summary}${when}`,
      'SERVICE_ASSIGNED',
      payload,
    );
    await this.pushToDrivers(
      [payload.driverId],
      label,
      `${payload.summary}${when}`,
      { type: 'SERVICE_ASSIGNED', referenceId: payload.referenceId, jobKind: 'MISSION' },
    );
    const passengerTitle =
      payload.serviceType === 'RENTAL' ? 'Chauffeur logistique assigné' : 'Livreur assigné';
    const passengerBody =
      payload.serviceType === 'RENTAL'
        ? `Un chauffeur MOVA a été assigné pour la livraison/récupération : ${payload.summary}`
        : `Un livreur a été assigné : ${payload.summary}`;
    await this.create(payload.passengerId, passengerTitle, passengerBody, 'SERVICE_ASSIGNED_PASSENGER', payload);
    this.logger.log(`service.assigned notification for driver ${payload.driverId} (${payload.serviceType})`);
  }

  async onDriverJobAlert(payload: DriverJobAlertPayload) {
    const userIds = [...new Set(payload.driverUserIds ?? [])];
    if (userIds.length === 0) return;
    await this.pushToDrivers(userIds, payload.title, payload.body, {
      type: payload.jobKind,
      referenceId: payload.referenceId,
      jobKind: payload.jobKind,
    });
    this.logger.log(`driver.job.alert push ${payload.jobKind} → ${userIds.length} chauffeur(s)`);
  }

  async onRentalBooking(payload: RentalBookingPayload) {
    const period = `${new Date(payload.startDate).toLocaleDateString('fr-FR')} → ${new Date(payload.endDate).toLocaleDateString('fr-FR')}`;
    const route =
      payload.pickupCity != null
        ? ` · ${payload.pickupCity}${payload.returnCity && payload.returnCity !== payload.pickupCity ? ` → ${payload.returnCity}` : ''}`
        : '';
    const passenger = payload.passengerName ?? payload.passengerPhone ?? 'Un passager';
    let title: string;
    let body: string;
    switch (payload.kind) {
      case 'NEW_BOOKING':
        title = 'Nouvelle réservation location';
        body = `${passenger} souhaite louer ${payload.vehicleName} (${period})${route}. Ouvrez le portail partenaire pour confirmer.`;
        break;
      case 'CONFIRMED':
        title = 'Réservation confirmée';
        body = `La location ${payload.vehicleName} (${period})${route} est confirmée.`;
        break;
      case 'CANCELLED':
        title = 'Réservation annulée';
        body = `La demande pour ${payload.vehicleName} (${period})${route} a été annulée.`;
        break;
      case 'LOGISTICS_ASSIGNED':
        title = 'Chauffeur logistique MOVA';
        body =
          payload.logisticsSummary ??
          `Un chauffeur MOVA a été assigné pour la livraison/récupération de ${payload.vehicleName}.`;
        break;
    }
    await this.create(payload.ownerUserId, title, body, 'RENTAL_BOOKING', payload);
    this.logger.log(`rental.booking ${payload.kind} for owner ${payload.ownerUserId}`);
  }

  async onServiceStatusUpdated(payload: ServiceStatusUpdatedPayload) {
    const body = this.serviceStatusMessage(payload);
    if (!body) return;
    const title =
      payload.serviceType === 'RENTAL'
        ? 'Mise à jour location'
        : payload.serviceType === 'MOVING'
          ? 'Mise à jour déménagement'
          : payload.serviceType === 'ERRAND'
            ? 'Mise à jour courses & commissions'
            : 'Mise à jour course planifiée';
    await this.create(payload.userId, title, body, 'SERVICE_STATUS', payload);
  }

  private serviceStatusMessage(payload: ServiceStatusUpdatedPayload): string | null {
    if (payload.serviceType === 'ERRAND') {
      return (
        {
          PENDING: 'Votre liste de courses est en attente d\'un livreur.',
          ASSIGNED: 'Un livreur a été assigné à vos achats.',
          IN_PROGRESS: 'Vos achats sont en cours.',
          COMPLETED: 'Courses & commissions livrées.',
          CANCELLED: 'Commande annulée.',
        }[payload.status] ?? null
      );
    }
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
