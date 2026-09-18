import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { INTERNAL_API_KEY, MARKET_RDC, serviceUrl } from '@mova/shared';

type MatchingConfig = typeof MARKET_RDC.matching;

@Injectable()
export class MatchingConfigService implements OnModuleInit {
  private readonly logger = new Logger(MatchingConfigService.name);
  private config: MatchingConfig = {
    ...MARKET_RDC.matching,
    scoreWeights: { ...MARKET_RDC.matching.scoreWeights },
  };
  private requireDocumentsForJobs = false;

  async onModuleInit() {
    await this.refresh().catch(() => undefined);
    setInterval(() => void this.refresh().catch(() => undefined), 60_000);
  }

  get(): MatchingConfig {
    return this.config;
  }

  /** Admin PlatformConfig.driverOps.requireDocumentsForJobs (default false). */
  documentsRequiredForJobs(): boolean {
    return this.requireDocumentsForJobs;
  }

  async refresh() {
    try {
      const res = await fetch(serviceUrl('ride', '/internal/platform-config'), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        config?: {
          matching?: MatchingConfig;
          driverOps?: { requireDocumentsForJobs?: boolean };
        };
      };
      if (body.config?.matching) {
        this.config = {
          ...body.config.matching,
          scoreWeights: { ...body.config.matching.scoreWeights },
        };
      }
      this.requireDocumentsForJobs = body.config?.driverOps?.requireDocumentsForJobs === true;
    } catch (err) {
      this.logger.debug(
        `platform-config refresh skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
