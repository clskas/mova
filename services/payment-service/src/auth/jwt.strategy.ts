import { Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
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

const AUTH_REVALIDATE_TIMEOUT_MS = 2000;

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

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AUTH_REVALIDATE_TIMEOUT_MS);
      try {
        res = await fetch(serviceUrl('auth', `/internal/users/${payload.sub}`), {
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      throw new ServiceUnavailableException("Service d'authentification indisponible. Réessayez.");
    }

    if (!res.ok) {
      if (res.status >= 500) {
        throw new ServiceUnavailableException("Service d'authentification indisponible. Réessayez.");
      }
      throw new UnauthorizedException();
    }

    const user = (await res.json()) as {
      id: string;
      phone?: string;
      role: string;
      status?: string;
    };
    try {
      assertActiveUserStatus(user.status);
    } catch {
      throw new UnauthorizedException('Compte suspendu');
    }
    return { id: user.id, phone: user.phone ?? payload.phone, role: user.role, status: user.status, jti: payload.jti };
  }
}
