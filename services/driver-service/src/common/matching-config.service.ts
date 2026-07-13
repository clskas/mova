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

  async onModuleInit() {
    await this.refresh().catch(() => undefined);
    setInterval(() => void this.refresh().catch(() => undefined), 60_000);
  }

  get(): MatchingConfig {
    return this.config;
  }

  async refresh() {
    const res = await fetch(serviceUrl('ride', '/internal/platform-config'), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    });
    if (!res.ok) return;
    const body = (await res.json()) as { config?: { matching?: MatchingConfig } };
    if (body.config?.matching) {
      this.config = {
        ...body.config.matching,
        scoreWeights: { ...body.config.matching.scoreWeights },
      };
    }
  }
}
