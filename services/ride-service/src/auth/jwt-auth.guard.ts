import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

function isPublicPath(path: string, method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase();
  const pathOnly = path.split('?')[0] ?? path;

  if (pathOnly.includes('/health')) return true;
  if (
    m === 'GET' &&
    (pathOnly.includes('/uploads/parcels/') ||
      pathOnly.includes('/uploads/menu/') ||
      pathOnly.includes('/uploads/vehicles/'))
  ) {
    return true;
  }
  if (pathOnly.includes('/rides/estimate')) return true;
  // Geo reads are public; POST import (and other mutations) require JWT.
  if (pathOnly.includes('/geo') && (m === 'GET' || m === 'HEAD' || m === 'OPTIONS')) return true;
  if (pathOnly.includes('/rental/vehicles') && (m === 'GET' || m === 'HEAD' || m === 'OPTIONS')) return true;
  if (m === 'GET' && pathOnly.includes('/publicites')) return true;
  if (m === 'GET' && pathOnly.includes('/public/')) return true;
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
}
