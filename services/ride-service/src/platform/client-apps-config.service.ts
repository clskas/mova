import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ClientAppsConfig,
  ClientAppId,
  DEFAULT_CLIENT_APPS_CONFIG,
  DEFAULT_MAINTENANCE_MESSAGE_FR,
  MM_OPERATOR_IDS,
  MmOperatorId,
  MovaErrorCode,
  MovaHttpException,
  mergeClientAppsConfig,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

const CONFIG_ID = 'client-apps';

@Injectable()
export class ClientAppsConfigService implements OnModuleInit {
  private readonly logger = new Logger(ClientAppsConfigService.name);
  private config: ClientAppsConfig = structuredClone(DEFAULT_CLIENT_APPS_CONFIG);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((err: unknown) => {
      this.logger.warn(
        `Client apps config load skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async refresh() {
    await this.ensureRow();
    const row = await this.prisma.platformConfig.findUnique({ where: { id: CONFIG_ID } });
    this.config = mergeClientAppsConfig(row?.config);
  }

  private async ensureRow() {
    await this.prisma.platformConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, config: DEFAULT_CLIENT_APPS_CONFIG as object },
      update: {},
    });
  }

  get(): ClientAppsConfig {
    return this.config;
  }

  getPublic() {
    return {
      mobileMoney: this.config.mobileMoney,
      maintenance: this.config.maintenance,
    };
  }

  async update(patch: Partial<ClientAppsConfig>) {
    await this.ensureRow();
    const next = mergeClientAppsConfig({
      mobileMoney: patch.mobileMoney
        ? { ...this.config.mobileMoney, ...patch.mobileMoney }
        : this.config.mobileMoney,
      maintenance: patch.maintenance
        ? {
            messageFr: patch.maintenance.messageFr ?? this.config.maintenance.messageFr,
            apps: { ...this.config.maintenance.apps, ...patch.maintenance.apps },
          }
        : this.config.maintenance,
    });

    this.validate(next);

    const row = await this.prisma.platformConfig.update({
      where: { id: CONFIG_ID },
      data: { config: next as object },
    });
    this.config = mergeClientAppsConfig(row.config);
    return this.getPublic();
  }

  private validate(cfg: ClientAppsConfig) {
    const msg = cfg.maintenance.messageFr?.trim() ?? '';
    if (!msg) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Le message de maintenance est requis.',
      );
    }
    if (msg.length > 2000) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Message de maintenance trop long (max 2000).',
      );
    }
    for (const app of Object.keys(cfg.mobileMoney) as ClientAppId[]) {
      const enabled = MM_OPERATOR_IDS.filter((op) => cfg.mobileMoney[app][op]);
      if (enabled.length === 0) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          `Au moins un opérateur Mobile Money doit rester visible pour ${app}.`,
        );
      }
    }
  }

  isOperatorEnabled(app: ClientAppId, operator: string): boolean {
    const op = operator as MmOperatorId;
    return MM_OPERATOR_IDS.includes(op) && this.config.mobileMoney[app]?.[op] === true;
  }
}

export { DEFAULT_MAINTENANCE_MESSAGE_FR };
