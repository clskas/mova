import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  INTERNAL_API_KEY,
  MARKET_RDC,
  normalizeDocumentTypeList,
  serviceUrl,
  type DocumentsOpsConfig,
} from '@mova/shared';

type MatchingConfig = typeof MARKET_RDC.matching;

const DEFAULT_DRIVER_OPS: Required<DocumentsOpsConfig> = {
  requireDocumentsForJobs: false,
  documentsGracePeriodDays: 7,
  requiredDriverDocuments: [],
  requiredRestaurantDocuments: [],
  requiredRentalCompanyDocuments: [],
  requiredRentalIndividualDocuments: [],
};

@Injectable()
export class MatchingConfigService implements OnModuleInit {
  private readonly logger = new Logger(MatchingConfigService.name);
  private config: MatchingConfig = {
    ...MARKET_RDC.matching,
    scoreWeights: { ...MARKET_RDC.matching.scoreWeights },
  };
  private driverOps: Required<DocumentsOpsConfig> = { ...DEFAULT_DRIVER_OPS };

  async onModuleInit() {
    await this.refresh().catch(() => undefined);
    setInterval(() => void this.refresh().catch(() => undefined), 60_000);
  }

  get(): MatchingConfig {
    return this.config;
  }

  /** Admin PlatformConfig.driverOps (documents + grace). */
  getDriverOps(): Required<DocumentsOpsConfig> {
    return this.driverOps;
  }

  /** Admin PlatformConfig.driverOps.requireDocumentsForJobs (default false). */
  documentsRequiredForJobs(): boolean {
    return this.driverOps.requireDocumentsForJobs === true;
  }

  documentsGracePeriodDays(): number {
    return this.driverOps.documentsGracePeriodDays;
  }

  requiredDriverDocuments(): string[] {
    return this.driverOps.requiredDriverDocuments;
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
          driverOps?: DocumentsOpsConfig;
        };
      };
      if (body.config?.matching) {
        this.config = {
          ...body.config.matching,
          scoreWeights: { ...body.config.matching.scoreWeights },
        };
      }
      const ops = body.config?.driverOps ?? {};
      this.driverOps = {
        requireDocumentsForJobs: ops.requireDocumentsForJobs === true,
        documentsGracePeriodDays: Math.max(
          0,
          Math.floor(Number(ops.documentsGracePeriodDays ?? DEFAULT_DRIVER_OPS.documentsGracePeriodDays) || 0),
        ),
        requiredDriverDocuments: normalizeDocumentTypeList(ops.requiredDriverDocuments),
        requiredRestaurantDocuments: normalizeDocumentTypeList(ops.requiredRestaurantDocuments),
        requiredRentalCompanyDocuments: normalizeDocumentTypeList(ops.requiredRentalCompanyDocuments),
        requiredRentalIndividualDocuments: normalizeDocumentTypeList(ops.requiredRentalIndividualDocuments),
      };
    } catch (err) {
      this.logger.debug(
        `platform-config refresh skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
