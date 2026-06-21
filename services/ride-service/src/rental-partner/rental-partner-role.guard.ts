import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@mova/shared';

@Injectable()
export class RentalPartnerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (req.user?.role !== UserRole.RENTAL_PARTNER) {
      throw new ForbiddenException('Accès réservé aux partenaires location MOVA');
    }
    return true;
  }
}
