import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AdminPermission,
  MovaErrorCode,
  MovaHttpException,
  hasAdminPermission,
  isAdminPanelRole,
} from '@mova/shared';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const role = user?.role ?? '';

    // Deny-by-default: admin routes must declare @RequirePermissions(...).
    if (!required?.length) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    if (!isAdminPanelRole(role)) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN);
    }

    const allowed = required.some((p) => hasAdminPermission(role, p));
    if (!allowed) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
