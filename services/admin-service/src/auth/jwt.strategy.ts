import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { isAdminPanelRole } from '@mova/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') ?? 'dev_secret',
    });
  }

  validate(payload: { sub: string; role: string }) {
    if (!isAdminPanelRole(payload.role)) {
      throw new UnauthorizedException('Accès réservé au panneau admin MOVA');
    }
    return { id: payload.sub, role: payload.role };
  }
}
