import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { assertActiveUserStatus, MovaJwtPayload } from '@mova/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') ?? 'dev_secret',
    });
  }
  validate(payload: MovaJwtPayload) {
    try {
      assertActiveUserStatus(payload.status);
    } catch {
      throw new UnauthorizedException('Compte suspendu');
    }
    return { id: payload.sub, phone: payload.phone, role: payload.role, status: payload.status };
  }
}
