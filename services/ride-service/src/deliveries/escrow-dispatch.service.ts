import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MOVA_EVENTS, PaymentCompletedPayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { DeliveriesService } from './deliveries.service';

/** Après séquestre SUCCESS, on ouvre le dispatch (offres / restaurant). */
@Injectable()
export class EscrowDispatchService implements OnModuleInit {
  private readonly logger = new Logger(EscrowDispatchService.name);

  constructor(
    private redis: RedisService,
    private deliveries: DeliveriesService,
  ) {}

  onModuleInit() {
    this.redis.sub.subscribe(MOVA_EVENTS.PAYMENT_COMPLETED, (err) => {
      if (err) this.logger.warn(`Redis subscribe unavailable: ${err.message}`);
    });
    this.redis.sub.on('message', (channel, message) => {
      if (channel !== MOVA_EVENTS.PAYMENT_COMPLETED) return;
      try {
        const payload = JSON.parse(message) as PaymentCompletedPayload;
        const type = (payload.referenceType ?? '').toUpperCase();
        if (type === 'DELIVERY' && payload.referenceId) {
          void this.deliveries.onEscrowCollected(payload.referenceId).catch((e) => {
            this.logger.warn(`onEscrowCollected ${payload.referenceId}: ${(e as Error).message}`);
          });
        }
      } catch (e) {
        this.logger.warn('Escrow dispatch handler error', e);
      }
    });
  }
}
