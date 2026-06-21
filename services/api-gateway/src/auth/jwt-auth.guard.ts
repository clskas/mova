import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const PUBLIC_PATHS = ['/api/auth/otp/request', '/api/auth/otp/verify', '/health'];

function isPublicPath(path: string, method?: string): boolean {
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return true;
  if (path.startsWith('/api/geo')) return true;
  if (path.startsWith('/api/rides/estimate')) return true;
  if (path.startsWith('/api/rental/vehicles')) return true;
  if (method === 'GET' && /\/api\/uploads\/(parcels|menu|vehicles)\/[^/]+$/.test(path.split('?')[0] ?? path)) {
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
