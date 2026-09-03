import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import {
  assertActiveUserStatus,
  INTERNAL_API_KEY,
  isJwtDenied,
  MovaJwtPayload,
  RedisService,
  resolveJwtSecret,
  serviceUrl,
} from '@mova/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get('JWT_SECRET')),
    });
  }
  async validate(payload: MovaJwtPayload) {
    if (await isJwtDenied(this.redis, payload)) {
      throw new UnauthorizedException('Session révoquée');
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(serviceUrl('auth', `/internal/users/${payload.sub}`), {
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
          signal: controller.signal,
        });
        if (res.status === 404) {
          throw new UnauthorizedException('Compte introuvable');
        }
        if (res.ok) {
          const user = (await res.json()) as { id: string; phone?: string; role: string; status?: string };
          try {
            assertActiveUserStatus(user.status);
          } catch {
            throw new UnauthorizedException('Compte suspendu');
          }
          return {
            id: user.id,
            phone: user.phone ?? payload.phone,
            role: user.role,
            status: user.status,
            jti: payload.jti,
          };
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
    }
    try {
      assertActiveUserStatus(payload.status);
    } catch {
      throw new UnauthorizedException('Compte suspendu');
    }
    return { id: payload.sub, phone: payload.phone, role: payload.role, status: payload.status, jti: payload.jti };
  }
}
