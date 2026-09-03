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

function authRevalidateTimeoutMs(): number {
  const raw = Number(process.env.AUTH_REVALIDATE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 8000;
}

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

  private async fetchAuthUser(userId: string): Promise<Response> {
    const attempts = 2;
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), authRevalidateTimeoutMs());
      try {
        return await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
          signal: controller.signal,
        });
      } catch (e) {
        lastError = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('auth revalidate failed');
  }

  async validate(payload: MovaJwtPayload) {
    if (await isJwtDenied(this.redis, payload)) {
      throw new UnauthorizedException('Session révoquée');
    }

    let res: Response;
    try {
      res = await this.fetchAuthUser(payload.sub);
    } catch {
      throw new ServiceUnavailableException("Service d'authentification indisponible. Réessayez.");
    }

    if (!res.ok) {
      if (res.status >= 500) {
        throw new ServiceUnavailableException("Service d'authentification indisponible. Réessayez.");
      }
      if (res.status === 404) {
        throw new UnauthorizedException('Session expirée. Reconnectez-vous.');
      }
      throw new UnauthorizedException('Session expirée. Reconnectez-vous.');
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
