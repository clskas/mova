import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MOVA_EVENTS, PaymentCompletedPayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { TrackingGateway } from './tracking.gateway';

/** Relaie `payment.completed` vers les rooms socket passager (course / livraison). */
@Injectable()
export class DeliveryPaymentEventsService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryPaymentEventsService.name);

  constructor(
    private redis: RedisService,
    private gateway: TrackingGateway,
  ) {}

  onModuleInit() {
    this.redis.sub.subscribe(MOVA_EVENTS.PAYMENT_COMPLETED, (err) => {
      if (err) {
        this.logger.warn(`Redis subscribe unavailable: ${err.message}`);
        return;
      }
      this.logger.log('Delivery/ride payment-completed live events subscribed');
    });
    this.redis.sub.on('message', (channel, message) => {
      if (channel !== MOVA_EVENTS.PAYMENT_COMPLETED) return;
      try {
        const payload = JSON.parse(message) as PaymentCompletedPayload;
        const referenceType = (payload.referenceType ?? 'RIDE').toUpperCase();
        const paymentPayload = {
          isPaid: true,
          paymentStatus: 'COMPLETED',
          method: payload.method,
        };
        if (referenceType === 'DELIVERY' && payload.referenceId) {
          this.logger.log(`PAYMENT_COMPLETED for DELIVERY/${payload.referenceId} -> broadcasting`);
          this.gateway.broadcastDeliveryPaymentCompleted(payload.referenceId, paymentPayload);
          return;
        }
        if (referenceType === 'ERRAND' && payload.referenceId) {
          this.logger.log(`PAYMENT_COMPLETED for ERRAND/${payload.referenceId} -> broadcasting`);
          this.gateway.broadcastDeliveryPaymentCompleted(payload.referenceId, paymentPayload);
          return;
        }
        const rideId = payload.rideId ?? (referenceType === 'RIDE' ? payload.referenceId : undefined);
        if (rideId) {
          this.logger.log(`PAYMENT_COMPLETED for RIDE/${rideId} -> broadcasting`);
          this.gateway.broadcastRidePaymentCompleted(rideId, paymentPayload);
        }
      } catch (e) {
        this.logger.warn('Payment-completed event handler error', e);
      }
    });
  }
}
