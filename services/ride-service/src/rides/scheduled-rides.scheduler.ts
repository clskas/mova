import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ScheduledRideStatus } from '@prisma/client';
import { ScheduledRidesService } from './scheduled-rides.service';

const TICK_INTERVAL_MS = 60_000;

@Injectable()
export class ScheduledRidesScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledRidesScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private scheduled: ScheduledRidesService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    this.logger.log('Scheduler courses planifiées actif (rappels, auto-assignation)');
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const reminders = await this.scheduled.processReminders();
      const assigned = await this.scheduled.processAutoAssignments();
      if (reminders > 0) this.logger.log(`${reminders} rappel(s) course planifiée envoyé(s)`);
      if (assigned > 0) this.logger.log(`${assigned} course(s) planifiée(s) auto-assignée(s)`);
    } catch (err) {
      this.logger.warn(`Scheduler planifiées échoué: ${(err as Error).message}`);
    }
  }
}
