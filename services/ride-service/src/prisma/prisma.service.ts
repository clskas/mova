import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connectPromise: Promise<void> | null = null;

  /**
   * Do not await DB here — Nest must bind HTTP quickly so Render `/health/live`
   * succeeds while Postgres wakes / migrate runs. Connect in background with retries.
   */
  async onModuleInit() {
    void this.ensureConnected();
  }

  async ensureConnected(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.connectWithRetry();
    }
    return this.connectPromise;
  }

  private async connectWithRetry(): Promise<void> {
    const maxAttempts = 12;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        if (attempt > 1) this.logger.log(`Prisma connected after ${attempt} attempt(s)`);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === maxAttempts) {
          this.logger.error(`Prisma connect failed after ${maxAttempts} attempts: ${msg}`);
          this.connectPromise = null;
          throw err;
        }
        const waitMs = Math.min(attempt * 1500, 8000);
        this.logger.warn(`Prisma connect attempt ${attempt}/${maxAttempts} failed — retry in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
