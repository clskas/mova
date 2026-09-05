import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log('Gel PIN / litige livraison actif (toutes les 5 min)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const [d, e] = await Promise.all([this.deliveries.freezeOverduePins(), this.errands.freezeOverduePins()]);
      if (d + e > 0) {
        this.logger.warn(`${d + e} commande(s) gelée(s) — délai PIN dépassé, pas de versement automatique`);
      }
    } catch (err) {
      this.logger.warn(`freezeOverduePins: ${(err as Error).message}`);
    }
  }
}
