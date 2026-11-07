import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import {
  SERVICE_PORTS,
  REQUEST_ID_HEADER,
  normalizeServiceBaseUrl,
  languageFromHeaders,
  translateResponseBody,
  type AppLanguage,
} from '@mova/shared';

const ROUTES: Record<string, keyof typeof SERVICE_PORTS> = {
  '/api/auth': 'auth',
  '/api/users': 'auth',
  '/api/rides': 'ride',
  '/api/tracking': 'ride',
  '/api/deliveries': 'ride',
  '/api/restaurant': 'ride',
  '/api/rental-partner': 'ride',
  '/api/services': 'ride',
  '/api/carpool': 'ride',
  '/api/errands': 'ride',
  '/api/rental': 'ride',
  '/api/history': 'ride',
  '/api/express': 'ride',
  '/api/moving': 'ride',
  '/api/geo': 'ride',
  '/api/poi-suggestions': 'ride',
  '/api/promo': 'ride',
  '/api/billing': 'ride',
  '/api/ratings': 'ride',
  '/api/uploads': 'ride',
  '/api/public': 'ride',
  '/api/publicites': 'ride',
  '/api/company-contacts': 'ride',
  '/api/payments': 'payment',
  '/api/wallet': 'payment',
  '/api/subscriptions': 'payment',
  '/api/drivers': 'driver',
  '/api/assistant': 'driver',
  '/api/incidents': 'driver',
  '/api/notifications': 'notification',
  '/api/admin': 'admin',
};

/** JSON responses above this size are passed through untranslated. */
const MAX_TRANSLATED_BYTES = 3 * 1024 * 1024;

/** Only the mobile apps' non-French users; portals stay in French and files are binary. */
export function wantsTranslation(req: Pick<Request, 'headers' | 'url' | 'originalUrl'>): boolean {
  if (languageFromHeaders(req.headers as Record<string, unknown>) === 'fr') return false;
  const path = req.originalUrl ?? req.url;
  if (/^\/api\/(admin|restaurant|rental-partner|uploads)(\/|\?|$)/.test(path)) return false;
  return !/\.(pdf|png|jpe?g|webp)(\?|$)/i.test(path) && !/\/pdf(\?|$)/.test(path);
}

/** Translates French server texts in a JSON body for a user who chose [lang]. */
export function translateJsonBuffer(buffer: Buffer, contentType: string | undefined, lang: AppLanguage = 'en'): Buffer | string {
  if (!contentType?.includes('application/json') || buffer.length === 0 || buffer.length > MAX_TRANSLATED_BYTES) {
    return buffer;
  }
  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    return JSON.stringify(translateResponseBody(parsed, lang));
  } catch {
    return buffer;
  }
}

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private proxies = new Map<string, ReturnType<typeof createProxyMiddleware>>();
  private translatingProxies = new Map<string, ReturnType<typeof createProxyMiddleware>>();

  constructor(private config: ConfigService) {
    const envMap: Record<string, string> = {
      auth: 'AUTH_SERVICE_URL',
      ride: 'RIDE_SERVICE_URL',
      payment: 'PAYMENT_SERVICE_URL',
      driver: 'DRIVER_SERVICE_URL',
      notification: 'NOTIFICATION_SERVICE_URL',
      admin: 'ADMIN_SERVICE_URL',
    };
    const forwardRequestId = (proxyReq: { setHeader(name: string, value: string): void }, req: unknown) => {
      const incoming = (req as Request).headers[REQUEST_ID_HEADER];
      if (incoming) {
        const value = Array.isArray(incoming) ? incoming[0] : incoming;
        proxyReq.setHeader('X-Request-Id', value);
      }
    };
    for (const svc of new Set(Object.values(ROUTES))) {
      const rawTarget = this.config.get<string>(envMap[svc]) ?? `http://localhost:${SERVICE_PORTS[svc]}`;
      const target = normalizeServiceBaseUrl(rawTarget) || `http://localhost:${SERVICE_PORTS[svc]}`;
      this.proxies.set(
        svc,
        createProxyMiddleware({
          target,
          changeOrigin: true,
          pathRewrite: (path) => path,
          on: { proxyReq: forwardRequestId },
        }),
      );
      this.translatingProxies.set(
        svc,
        createProxyMiddleware({
          target,
          changeOrigin: true,
          pathRewrite: (path) => path,
          selfHandleResponse: true,
          on: {
            proxyReq: forwardRequestId,
            proxyRes: responseInterceptor(async (buffer, proxyRes, req) =>
              translateJsonBuffer(
                buffer,
                proxyRes.headers['content-type'],
                languageFromHeaders((req as Request).headers as Record<string, unknown>),
              ),
            ),
          },
        }),
      );
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.originalUrl ?? req.url;
    const match = Object.keys(ROUTES).find((prefix) => path.startsWith(prefix));
    if (!match) return next();
    const svc = ROUTES[match];
    const pool = wantsTranslation(req) ? this.translatingProxies : this.proxies;
    return pool.get(svc)!(req, res, next);
  }
}
