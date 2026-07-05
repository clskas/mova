import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MOVA_EVENTS,
  RentalBookingPayload,
  RentalPartnerVehiclePayload,
  ServiceStatusUpdatedPayload,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from './tracking.gateway';

@Injectable()
export class PartnerPortalEventsService implements OnModuleInit {
  private readonly logger = new Logger(PartnerPortalEventsService.name);

  constructor(
    private redis: RedisService,
    private gateway: TrackingGateway,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const channels = [
      MOVA_EVENTS.RENTAL_BOOKING,
      MOVA_EVENTS.SERVICE_STATUS_UPDATED,
      MOVA_EVENTS.RENTAL_PARTNER_VEHICLE,
    ];
    this.redis.sub.subscribe(...channels, (err) => {
      if (err) {
        this.logger.warn(`Redis subscribe unavailable: ${err.message}`);
        return;
      }
      this.logger.log('Partner portal live events subscribed');
    });
    this.redis.sub.on('message', (channel, message) => {
      void this.handleMessage(channel, message);
    });
  }

  private async handleMessage(channel: string, message: string) {
    try {
      const data = JSON.parse(message) as unknown;
      if (channel === MOVA_EVENTS.RENTAL_BOOKING) {
        const payload = data as RentalBookingPayload;
        if (!payload.ownerUserId) return;
        this.gateway.broadcastPartnerRentalEvent(payload.ownerUserId, {
          type: 'rental',
          kind: payload.kind,
          inquiryId: payload.inquiryId,
          status: payload.status,
        });
        return;
      }
      if (channel === MOVA_EVENTS.SERVICE_STATUS_UPDATED) {
        const payload = data as ServiceStatusUpdatedPayload;
        if (payload.serviceType !== 'RENTAL') return;
        const ownerUserId = await this.resolveRentalOwnerUserId(payload.referenceId);
        if (!ownerUserId) return;
        this.gateway.broadcastPartnerRentalEvent(ownerUserId, {
          type: 'booking-status',
          inquiryId: payload.referenceId,
          status: payload.status,
        });
        return;
      }
      if (channel === MOVA_EVENTS.RENTAL_PARTNER_VEHICLE) {
        const payload = data as RentalPartnerVehiclePayload;
        if (!payload.ownerUserId) return;
        this.gateway.broadcastPartnerVehicleEvent(payload.ownerUserId, {
          vehicleId: payload.vehicleId,
          action: payload.action,
          approvalStatus: payload.approvalStatus,
          isActive: payload.isActive,
        });
      }
    } catch (e) {
      this.logger.warn('Partner portal event handler error', e);
    }
  }

  private async resolveRentalOwnerUserId(inquiryId: string): Promise<string | null> {
    const row = await this.prisma.rentalInquiry.findUnique({
      where: { id: inquiryId },
      select: { vehicle: { select: { ownerUserId: true } } },
    });
    return row?.vehicle?.ownerUserId ?? null;
  }
}
