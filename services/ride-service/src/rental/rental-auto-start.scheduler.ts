import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RentalService } from './rental.service';

const AUTO_START_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class RentalAutoStartScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RentalAutoStartScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private rental: RentalService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), AUTO_START_INTERVAL_MS);
    this.logger.log(`Auto-démarrage location actif (toutes les ${AUTO_START_INTERVAL_MS / 60_000} min)`);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const count = await this.rental.autoStartDueBookings();
      if (count > 0) {
        this.logger.log(`${count} location(s) passée(s) automatiquement en cours (date de début atteinte)`);
      }
    } catch (err) {
      this.logger.warn(`Auto-démarrage location échoué: ${(err as Error).message}`);
    }
  }
}
