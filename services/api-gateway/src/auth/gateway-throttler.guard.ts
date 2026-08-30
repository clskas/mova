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
