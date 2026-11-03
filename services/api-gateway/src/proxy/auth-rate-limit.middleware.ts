import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Per-IP limit on OTP / PIN / social login endpoints.
 *
 * Nest runs middleware before guards, and {@link ProxyMiddleware} answers every
 * /api/* request itself — so APP_GUARD throttling never sees proxied traffic.
 * This middleware is registered ahead of the proxy instead.
 *
 * Limit is generous on purpose: RDC mobile carriers put many subscribers behind
 * one CGNAT address. The SMS-cost protection is the per-phone quota in auth-service.
 */
const AUTH_SENSITIVE_PREFIXES = [
  '/api/auth/otp/request',
  '/api/auth/otp/verify',
  '/api/auth/pin/login',
  '/api/auth/google',
  '/api/auth/apple',
  '/api/auth/link-google',
  '/api/auth/link-phone',
];

/** Several logins (2 sensitive calls each) per subscriber behind a shared IP. Override: AUTH_IP_RATE_LIMIT. */
export const AUTH_IP_LIMIT = (() => {
  const n = Number.parseInt(process.env.AUTH_IP_RATE_LIMIT ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 120;
})();
export const AUTH_IP_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 50_000;

function firstHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').split(',')[0]?.trim() ?? '';
}

export function clientIp(req: Request): string {
  return (
    firstHeader(req.headers['cf-connecting-ip']) ||
    firstHeader(req.headers['true-client-ip']) ||
    firstHeader(req.headers['x-forwarded-for']) ||
    req.ip ||
    'unknown'
  );
}

@Injectable()
export class AuthRateLimitMiddleware implements NestMiddleware {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  use(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'POST') return next();
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    if (!AUTH_SENSITIVE_PREFIXES.some((p) => path.startsWith(p))) return next();

    const now = Date.now();
    const key = clientIp(req);
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= MAX_TRACKED_KEYS) this.prune(now);
      entry = { count: 0, resetAt: now + AUTH_IP_WINDOW_MS };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > AUTH_IP_LIMIT) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Trop de tentatives. Réessayez dans une minute.',
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
