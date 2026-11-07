import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MoneyControlService } from './money-control.service';

const TICK_MS = 30 * 60 * 1000;
/** 01:00 in Lubumbashi (UTC+2) = 23:00 UTC. */
const RUN_HOUR_UTC = 23;

/** Runs the money control once a night (read-only report). */
@Injectable()
export class MoneyControlScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MoneyControlScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private control: MoneyControlService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const now = new Date();
    if (now.getUTCHours() !== RUN_HOUR_UTC) return;
    try {
      const last = await this.control.latest();
      if (last && now.getTime() - new Date(last.startedAt).getTime() < 20 * 3600_000) return;
      await this.control.run();
    } catch (err) {
      this.logger.warn(`money control tick: ${(err as Error).message}`);
    }
  }
}
