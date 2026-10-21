import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Exported for unit tests — Render cold-start / connection flap. */
export function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P1017 server closed connection; P1001 can't reach; P1002 timed out
    if (err.code === 'P1017' || err.code === 'P1001' || err.code === 'P1002') return true;
  }
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  return (
    lower.includes('service temporarily unavailable') ||
    lower.includes('database system is starting up') ||
    lower.includes('server has closed the connection') ||
    lower.includes('can\'t reach database') ||
    lower.includes('connection reset') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('too many connections')
  );
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connectPromise: Promise<void> | null = null;

  /**
   * Connect in background with retries. Never leave an unhandled rejection —
   * that was crashing the Render process (exit 1) during Postgres wake.
   */
  async onModuleInit() {
    void this.ensureConnected().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Background Prisma connect still failing (app stays up): ${msg}`);
    });
  }

  async ensureConnected(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.connectWithRetry().catch((err) => {
        this.connectPromise = null;
        throw err;
      });
    }
    return this.connectPromise;
  }

  private async connectWithRetry(): Promise<void> {
    const maxAttempts = 16;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        if (attempt > 1) this.logger.log(`Prisma connected after ${attempt} attempt(s)`);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === maxAttempts) {
          this.logger.error(`Prisma connect failed after ${maxAttempts} attempts: ${msg}`);
          throw err;
        }
        const waitMs = Math.min(attempt * 1500, 10000);
        this.logger.warn(`Prisma connect attempt ${attempt}/${maxAttempts} failed — retry in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  /**
   * Run a DB operation with retries on Render cold-start / connection flap.
   * Prefer this for critical paths; most Nest handlers still use prisma.* directly
   * and rely on entrypoint wait + reconnect.
   */
  async withRetry<T>(fn: () => Promise<T>, label = 'query'): Promise<T> {
    const maxAttempts = 5;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.ensureConnected();
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isTransientDbError(err) || attempt === maxAttempts) throw err;
        this.connectPromise = null;
        try {
          await this.$disconnect().catch(() => undefined);
        } catch {
          /* ignore */
        }
        const waitMs = Math.min(attempt * 1000, 5000);
        this.logger.warn(
          `Transient DB error on ${label} (attempt ${attempt}/${maxAttempts}) — retry in ${waitMs}ms`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw lastErr;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
