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

/**
 * When auth-service is briefly down (restart during a deploy), a user verified live a few
 * minutes ago is still accepted, instead of « Service d'authentification indisponible »
 * (Sentry SENGA-BACKEND-K). Never used for a user never verified (fail-closed), and a
 * revoked session (Redis deny list) is still refused.
 */
function authStaleGraceMs(): number {
  const raw = Number(process.env.AUTH_STALE_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5 * 60_000;
}

/** Waits between attempts: auth-service usually answers again within a second or two. */
const RETRY_DELAYS_MS = [0, 400, 1200];

type VerifiedUser = { id: string; phone?: string; role: string; status?: string; jti?: string };

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

  /** Last live answer per user, for the short grace above. */
  private readonly verified = new Map<string, { user: VerifiedUser; at: number }>();

  private remember(user: VerifiedUser) {
    if (this.verified.size > 5000) this.verified.clear();
    this.verified.set(user.id, { user, at: Date.now() });
  }

  private recent(userId: string): VerifiedUser | null {
    const hit = this.verified.get(userId);
    if (!hit || Date.now() - hit.at > authStaleGraceMs()) return null;
    return hit.user;
  }

  /** Retries network errors and 5xx (restart), returns any other answer at once. */
  private async fetchAuthUser(userId: string): Promise<Response> {
    let lastError: unknown;
    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), authRevalidateTimeoutMs());
      try {
        const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
          headers: { 'x-internal-api-key': INTERNAL_API_KEY },
          signal: controller.signal,
        });
        if (res.status < 500) return res;
        lastError = new Error(`auth-service ${res.status}`);
      } catch (e) {
        lastError = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('auth revalidate failed');
  }

  private unavailable(payload: MovaJwtPayload): VerifiedUser {
    const cached = this.recent(payload.sub);
    if (cached) return { ...cached, jti: payload.jti };
    throw new ServiceUnavailableException("Service d'authentification indisponible. Réessayez.");
  }

  async validate(payload: MovaJwtPayload) {
    if (await isJwtDenied(this.redis, payload)) {
      throw new UnauthorizedException('Session révoquée');
    }

    let res: Response;
    try {
      res = await this.fetchAuthUser(payload.sub);
    } catch {
      return this.unavailable(payload);
    }

    if (!res.ok) {
      this.verified.delete(payload.sub);
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
      this.verified.delete(payload.sub);
      throw new UnauthorizedException('Compte suspendu');
    }
    const verified = { id: user.id, phone: user.phone ?? payload.phone, role: user.role, status: user.status };
    this.remember(verified);
    return { ...verified, jti: payload.jti };
  }
}
