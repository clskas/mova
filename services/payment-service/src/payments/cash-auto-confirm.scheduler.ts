import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { runClusterTick, RedisService } from '@mova/shared';
import { PaymentsService } from './payments.service';

const TICK_MS = 15 * 60 * 1000;

/** Auto-clôture espèces PENDING après 24 h sans litige (plafonné). */
@Injectable()
export class CashAutoConfirmScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CashAutoConfirmScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private payments: PaymentsService, @Optional() private readonly clusterRedis?: RedisService) {}

  onModuleInit() {
    this.timer = setInterval(() => void runClusterTick(this.clusterRedis, 'cash-auto-confirm', TICK_MS, () => this.tick()), TICK_MS);
    this.logger.log('Cash auto-confirm scheduler actif (toutes les 15 min, délai 24 h)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const n = await this.payments.autoConfirmStaleCashPayments();
      if (n > 0) {
        this.logger.log(`${n} paiement(s) espèces auto-confirmé(s) après délai sans litige`);
      }
    } catch (err) {
      this.logger.warn(`cash auto-confirm tick: ${(err as Error).message}`);
    }
  }
}
