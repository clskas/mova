import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MOVA_EVENTS, RideCashPendingPayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { TrackingGateway } from './tracking.gateway';

/**
 * Relaie l'événement Redis `ride.cash.pending` (émis par payment-service quand
 * le passager règle en espèces) vers la room socket de la course, afin que
 * l'application chauffeur ouvre automatiquement la confirmation du PIN.
 */
@Injectable()
export class RideCashEventsService implements OnModuleInit {
  private readonly logger = new Logger(RideCashEventsService.name);

  constructor(
    private redis: RedisService,
    private gateway: TrackingGateway,
  ) {}

  onModuleInit() {
    this.redis.sub.subscribe(MOVA_EVENTS.RIDE_CASH_PENDING, (err) => {
      if (err) {
        this.logger.warn(`Redis subscribe unavailable: ${err.message}`);
        return;
      }
      this.logger.log('Ride cash-pending live events subscribed');
    });
    this.redis.sub.on('message', (channel, message) => {
      if (channel !== MOVA_EVENTS.RIDE_CASH_PENDING) return;
      try {
        const payload = JSON.parse(message) as RideCashPendingPayload;
        if (!payload.rideId) return;
        this.logger.log(`RIDE_CASH_PENDING received for ride ${payload.rideId} -> broadcasting`);
        this.gateway.broadcastRideCashPending(payload.rideId, { amountCdf: payload.amountCdf });
      } catch (e) {
        this.logger.warn('Ride cash-pending event handler error', e);
      }
    });
  }
}
