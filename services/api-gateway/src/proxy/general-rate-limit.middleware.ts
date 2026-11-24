import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { isAllowedLoadTest } from '../auth/gateway-throttler.guard';
import { clientIp } from './auth-rate-limit.middleware';

/**
 * Per-IP ceiling on every /api request (security audit 2026-11-24).
 *
 * The Nest throttler guard never runs for proxied traffic (the proxy middleware answers
 * first), so only the auth endpoints were limited. This middleware runs before the proxy.
 *
 * Generous on purpose: a driver app polls ~60 requests/min, and RDC carriers put many
 * subscribers behind one CGNAT address. It stops floods, not normal use.
 * Override with GATEWAY_IP_RATE_LIMIT (requests per minute).
 */
export const GENERAL_IP_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 100_000;

export function generalIpLimit(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.GATEWAY_IP_RATE_LIMIT ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}

@Injectable()
export class GeneralRateLimitMiddleware implements NestMiddleware {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit = generalIpLimit();

  use(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'OPTIONS') return next();
    // Mobile Money callbacks come from a few provider addresses: never throttle them.
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    if (path.startsWith('/api/payments/webhooks/') || path.startsWith('/api/payments/africastalking/')) {
      return next();
    }
    if (isAllowedLoadTest(req.headers['x-senga-load-test'])) return next();

    const now = Date.now();
    const key = clientIp(req);
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= MAX_TRACKED_KEYS) this.prune(now);
      entry = { count: 0, resetAt: now + GENERAL_IP_WINDOW_MS };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Trop de requêtes. Réessayez dans une minute.',
      });
      return;
    }
    next();
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) {
      if (v.resetAt <= now) this.hits.delete(k);
    }
    if (this.hits.size >= MAX_TRACKED_KEYS) this.hits.clear();
  }
}
