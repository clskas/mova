import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Path segment match from the service root (with or without the /api prefix). */
function startsWithRoute(pathOnly: string, route: string): boolean {
  const p = pathOnly.startsWith('/api/') ? pathOnly.slice(4) : pathOnly;
  return p === route || p.startsWith(`${route}/`);
}

function isPublicPath(path: string, method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase();
  const pathOnly = path.split('?')[0] ?? path;
  const read = m === 'GET' || m === 'HEAD' || m === 'OPTIONS';

  if (startsWithRoute(pathOnly, '/health')) return true;
  if (
    m === 'GET' &&
    /^(\/api)?\/uploads\/(parcels|menu|vehicles|moving)\/[^/]+$/.test(pathOnly)
  ) {
    return true;
  }
  if (startsWithRoute(pathOnly, '/rides/estimate') || startsWithRoute(pathOnly, '/rides/shared/estimate')) {
    return true;
  }
  // Geo reads are public; POST import (and other mutations) require JWT.
  if (startsWithRoute(pathOnly, '/geo') && read) return true;
  if (startsWithRoute(pathOnly, '/rental/vehicles') && read) return true;
  if (m === 'GET' && startsWithRoute(pathOnly, '/publicites')) return true;
  if (m === 'GET' && startsWithRoute(pathOnly, '/company-contacts')) return true;
  if (m === 'GET' && startsWithRoute(pathOnly, '/public')) return true;
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
