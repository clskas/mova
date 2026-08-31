import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@mova/shared';

@Injectable()
export class RestaurantRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const role = req.user?.role;
    if (role !== UserRole.RESTAURANT && role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Accès réservé aux comptes restaurant');
    }
    return true;
  }
}
