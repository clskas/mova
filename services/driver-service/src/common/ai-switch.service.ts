import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { setAdminAiEnabled } from './ai-switch';

/** Reads the super admin AI switch every minute (kept on when the config cannot be read). */
@Injectable()
export class AiSwitchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiSwitchService.name);
  private timer?: NodeJS.Timeout;

  onModuleInit() {
    // Never delay the boot: the switch stays on until the first read succeeds.
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh() {
    try {
      const res = await fetch(serviceUrl('ride', '/internal/client-apps-config'), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { ai?: { enabled?: boolean } };
      const enabled = body.ai?.enabled !== false;
      setAdminAiEnabled(enabled);
    } catch (err) {
      this.logger.debug(`AI switch refresh skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
