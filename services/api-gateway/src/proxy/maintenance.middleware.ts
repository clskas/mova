import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import {
  ClientAppsConfig,
  DEFAULT_CLIENT_APPS_CONFIG,
  isAppInMaintenance,
  mergeClientAppsConfig,
  normalizeServiceBaseUrl,
  resolveClientAppFromRequest,
  resolveInternalApiKey,
  SERVICE_PORTS,
} from '@mova/shared';

const ALLOW_PREFIXES = [
  '/health',
  '/api/public/app-version',
  '/api/public/client-config',
  '/api/public/cgu',
  '/api/payments/webhooks/',
  '/api/payments/africastalking/callback',
];

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MaintenanceMiddleware.name);
  private cached: ClientAppsConfig = structuredClone(DEFAULT_CLIENT_APPS_CONFIG);
  private cachedAt = 0;
  private readonly ttlMs = 15_000;
  private inflight: Promise<ClientAppsConfig> | null = null;

  constructor(private config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    if (ALLOW_PREFIXES.some((p) => path === p || path.startsWith(p))) {
      return next();
    }
    if (req.method === 'OPTIONS') return next();

    void this.getConfig()
      .then((cfg) => {
        const header = req.header('x-senga-client') ?? req.header('X-Senga-Client');
        const jwtRole = (req as Request & { user?: { role?: string } }).user?.role;
        const app = resolveClientAppFromRequest({ header, path, jwtRole });
        if (!app || !isAppInMaintenance(cfg, app)) {
          return next();
        }
        const message = cfg.maintenance.messageFr;
        res.status(503).json({
          success: false,
          maintenance: true,
          message,
          error: {
            code: 'MAINTENANCE',
            message,
          },
        });
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Maintenance check skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
        next();
      });
  }

  private async getConfig(): Promise<ClientAppsConfig> {
    const now = Date.now();
    if (now - this.cachedAt < this.ttlMs) return this.cached;
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchConfig()
      .then((cfg) => {
        this.cached = cfg;
        this.cachedAt = Date.now();
        return cfg;
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }

  private async fetchConfig(): Promise<ClientAppsConfig> {
    const raw =
      this.config.get<string>('RIDE_SERVICE_URL') ?? `http://localhost:${SERVICE_PORTS.ride}`;
    const base = normalizeServiceBaseUrl(raw) || `http://localhost:${SERVICE_PORTS.ride}`;
    const key = resolveInternalApiKey();
    const res = await fetch(`${base}/internal/client-apps-config`, {
      headers: { 'x-internal-api-key': key },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return this.cached;
    const body = (await res.json()) as unknown;
    return mergeClientAppsConfig(body);
  }
}
