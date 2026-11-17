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

/**
 * How long a live answer from auth-service is reused for the same user.
 * Drivers send their GPS position every 8 s: without this, every position was also a call
 * to auth-service (+ a database read there). At 1,000 drivers that saturated auth-service
 * in the staging load test (2026-11-17, tier 2). A revoked session is still refused at once
 * (Redis deny list, checked first); a suspension reaches this service within this delay.
 */
export function authUserCacheMs(): number {
  const raw = Number(process.env.AUTH_USER_CACHE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
}

type VerifiedUser = { id: string; phone?: string; role: string; status?: string };

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
  private readonly verified = new Map<string, { user: VerifiedUser; at: number }>();

  private fresh(userId: string): VerifiedUser | null {
    const hit = this.verified.get(userId);
    if (!hit || Date.now() - hit.at > authUserCacheMs()) return null;
    return hit.user;
  }

  private remember(user: VerifiedUser) {
    if (this.verified.size > 20_000) this.verified.clear();
    this.verified.set(user.id, { user, at: Date.now() });
  }

  async validate(payload: MovaJwtPayload) {
    if (await isJwtDenied(this.redis, payload)) {
      throw new UnauthorizedException('Session révoquée');
    }
    const cached = this.fresh(payload.sub);
    if (cached) return { ...cached, jti: payload.jti };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(serviceUrl('auth', `/internal/users/${payload.sub}`), {
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
          signal: controller.signal,
        });
        if (res.status === 404) {
          this.verified.delete(payload.sub);
          throw new UnauthorizedException('Compte introuvable');
        }
        if (res.ok) {
          const user = (await res.json()) as { id: string; phone?: string; role: string; status?: string };
          try {
            assertActiveUserStatus(user.status);
          } catch {
            this.verified.delete(payload.sub);
            throw new UnauthorizedException('Compte suspendu');
          }
          const verified = { id: user.id, phone: user.phone ?? payload.phone, role: user.role, status: user.status };
          this.remember(verified);
          return { ...verified, jti: payload.jti };
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
