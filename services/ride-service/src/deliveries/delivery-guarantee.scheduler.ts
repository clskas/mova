import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { runClusterTick, RedisService } from '@mova/shared';
import { DeliveriesService } from './deliveries.service';
import { ErrandsService } from '../errands/errands.service';

const TICK_MS = 5 * 60 * 1000;

@Injectable()
export class DeliveryGuaranteeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryGuaranteeScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private deliveries: DeliveriesService,
    private errands: ErrandsService,
    @Optional() private readonly clusterRedis?: RedisService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void runClusterTick(this.clusterRedis, 'delivery-guarantee', TICK_MS, () => this.tick()), TICK_MS);
    this.logger.log('Gel PIN / timeouts repas (acceptation & paiement) actifs (toutes les 5 min)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const [d, e, food] = await Promise.all([
        this.deliveries.freezeOverduePins(),
        this.errands.freezeOverduePins(),
        this.deliveries.cancelStaleFoodOrders(),
      ]);
      if (d + e > 0) {
        this.logger.warn(`${d + e} commande(s) gelée(s) — délai PIN dépassé, pas de versement automatique`);
      }
      if (food > 0) {
        this.logger.warn(`${food} commande(s) repas annulée(s) — délai acceptation / paiement dépassé`);
      }
    } catch (err) {
      this.logger.warn(`delivery guarantee tick: ${(err as Error).message}`);
    }
  }
}
