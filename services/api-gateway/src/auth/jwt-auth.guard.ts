import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const PUBLIC_PATHS = [
  '/api/auth/otp/request',
  '/api/auth/otp/verify',
  '/api/auth/login/options',
  '/api/auth/pin/login',
  '/health',
];

function isPublicPath(path: string, method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase();
  const pathOnly = (path.split('?')[0] ?? path);

  if (PUBLIC_PATHS.some((p) => pathOnly.startsWith(p))) return true;

  // Geo catalog/autocomplete are public reads; mutating geo (e.g. POI import) requires JWT.
  if (pathOnly.startsWith('/api/geo') && (m === 'GET' || m === 'HEAD' || m === 'OPTIONS')) return true;

  if (pathOnly.startsWith('/api/rides/estimate')) return true;
  if (pathOnly.startsWith('/api/rental/vehicles') && (m === 'GET' || m === 'HEAD' || m === 'OPTIONS')) return true;
  if (m === 'GET' && pathOnly.startsWith('/api/publicites')) return true;
  // Shared trip links (tokenized) — read-only, no auth.
  if (m === 'GET' && pathOnly.startsWith('/api/public/')) return true;
  if (m === 'GET' && pathOnly.startsWith('/api/services')) return true;
  if (m === 'GET' && /\/api\/uploads\/(parcels|menu|vehicles|moving)\/[^/]+$/.test(pathOnly)) {
    return true;
  }
  // Mobile Money callbacks (no JWT — verified by HMAC / provider secret).
  if (
    pathOnly.startsWith('/api/payments/webhooks/') ||
    pathOnly.startsWith('/api/payments/africastalking/callback')
  ) {
    return true;
  }
  return false;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const path = req.originalUrl ?? req.url;
    if (isPublicPath(path, req.method)) return true;
    return super.canActivate(context);
  }
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser,
    _info?: unknown,
    _context?: ExecutionContext,
  ): TUser {
    if (err || !user) throw err || new UnauthorizedException();
    return user;
  }
}
