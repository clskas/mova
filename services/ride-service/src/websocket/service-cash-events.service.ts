import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MOVA_EVENTS, ServiceCashPendingPayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { TrackingGateway } from './tracking.gateway';

/**
 * Relaie `service.cash.pending` (livraisons, courses, etc.) vers la room socket
 * de la livraison pour que le livreur ouvre automatiquement la confirmation PIN.
 */
@Injectable()
export class ServiceCashEventsService implements OnModuleInit {
  private readonly logger = new Logger(ServiceCashEventsService.name);

  constructor(
    private redis: RedisService,
    private gateway: TrackingGateway,
  ) {}

  onModuleInit() {
    this.redis.sub.subscribe(MOVA_EVENTS.SERVICE_CASH_PENDING, (err) => {
      if (err) {
        this.logger.warn(`Redis subscribe unavailable: ${err.message}`);
        return;
      }
      this.logger.log('Service cash-pending live events subscribed');
    });
    this.redis.sub.on('message', (channel, message) => {
      if (channel !== MOVA_EVENTS.SERVICE_CASH_PENDING) return;
      try {
        const payload = JSON.parse(message) as ServiceCashPendingPayload;
        if (!payload.referenceId) return;
        const type = (payload.referenceType ?? 'DELIVERY').toUpperCase();
        this.logger.log(`SERVICE_CASH_PENDING received for ${type}/${payload.referenceId} -> broadcasting`);
        this.gateway.broadcastDeliveryCashPending(payload.referenceId, {
          amountCdf: payload.amountCdf,
          referenceType: type,
          driverId: payload.driverId,
        });
      } catch (e) {
        this.logger.warn('Service cash-pending event handler error', e);
      }
    });
  }
}
