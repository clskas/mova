import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { assertActiveUserStatus, isAdminPanelRole, MovaJwtPayload, resolveJwtSecret } from '@mova/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get('JWT_SECRET')),
    });
  }

  validate(payload: MovaJwtPayload) {
    try {
      assertActiveUserStatus(payload.status);
    } catch {
      throw new UnauthorizedException('Compte suspendu');
    }
    if (!isAdminPanelRole(payload.role)) {
      throw new UnauthorizedException('Accès réservé au panneau admin SENGA');
    }
    return { id: payload.sub, role: payload.role, status: payload.status };
  }
}
