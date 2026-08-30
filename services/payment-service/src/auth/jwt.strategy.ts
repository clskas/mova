import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import {
  assertActiveUserStatus,
  INTERNAL_API_KEY,
  MovaJwtPayload,
  resolveJwtSecret,
  serviceUrl,
} from '@mova/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get('JWT_SECRET')),
    });
  }

  async validate(payload: MovaJwtPayload) {
    try {
      const res = await fetch(serviceUrl('auth', `/internal/users/${payload.sub}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (res.ok) {
        const user = (await res.json()) as {
          id: string;
          phone?: string;
          role: string;
          status?: string;
        };
        assertActiveUserStatus(user.status);
        return { id: user.id, phone: user.phone ?? payload.phone, role: user.role, status: user.status };
      }
    } catch {
      /* auth unreachable — fall back to JWT claims */
    }
    try {
      assertActiveUserStatus(payload.status);
    } catch {
      throw new UnauthorizedException('Compte suspendu');
    }
    return { id: payload.sub, phone: payload.phone, role: payload.role, status: payload.status };
  }
}
