import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { INTERNAL_API_KEY } from '@mova/shared';

export function matchesInternalApiKey(header: unknown, expected = INTERNAL_API_KEY): boolean {
  const provided = Array.isArray(header) ? header[0] : header;
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    return matchesInternalApiKey(req.headers['x-internal-api-key']);
  }
}
