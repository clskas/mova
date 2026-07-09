import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const PUBLIC_SUFFIXES = ['/rides/estimate', '/geo', '/rental/vehicles', '/publicites'];

function isPublicPath(path: string): boolean {
  if (path.includes('/health')) return true;
  if (path.includes('/uploads/parcels/') || path.includes('/uploads/menu/') || path.includes('/uploads/vehicles/')) {
    return true;
  }
  return PUBLIC_SUFFIXES.some((suffix) => path.includes(suffix));
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const path = req.originalUrl ?? req.url;
    if (isPublicPath(path)) return true;
    return super.canActivate(context);
  }
}
