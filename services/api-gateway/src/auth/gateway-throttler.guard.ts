import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/** Stricter limits for auth OTP / PIN endpoints (abuse / brute-force). */
const AUTH_SENSITIVE_PREFIXES = [
  '/api/auth/otp/request',
  '/api/auth/otp/verify',
  '/api/auth/pin/login',
  '/api/auth/google',
  '/api/auth/link-google',
  '/api/auth/link-phone',
];

const AUTH_LIMIT = 8;

/**
 * Load test on STAGING only: requests carrying the secret LOAD_TEST_KEY (header
 * x-senga-load-test) skip the per-IP limits, because the whole test comes from one machine.
 * Never in production (APP_ENV / NODE_ENV production), never without a key of 24+ characters.
 */
export function isAllowedLoadTest(headerValue: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.LOAD_TEST_KEY ?? '';
  if (key.length < 24) return false;
  const appEnv = (env.APP_ENV ?? '').toLowerCase();
  if (appEnv === 'production' || appEnv === 'prod') return false;
  if (!appEnv && env.NODE_ENV === 'production') return false;
  const got = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof got !== 'string' || got.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
const AUTH_TTL_MS = 60_000;

@Injectable()
export class GatewayThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    return String(ip ?? 'unknown');
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const { req } = this.getRequestResponse(context);
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    const sensitive = AUTH_SENSITIVE_PREFIXES.some((p) => path.startsWith(p));
    const base = super.generateKey(context, suffix, name);
    return sensitive ? `${base}:auth-sensitive` : base;
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { req } = this.getRequestResponse(requestProps.context);
    if (isAllowedLoadTest(req.headers?.['x-senga-load-test'])) return true;
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    const sensitive = AUTH_SENSITIVE_PREFIXES.some((p) => path.startsWith(p));

    if (sensitive) {
      return super.handleRequest({
        ...requestProps,
        limit: AUTH_LIMIT,
        ttl: AUTH_TTL_MS,
      });
    }
    return super.handleRequest(requestProps);
  }
}
