import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { assertActiveUserStatus, isJwtDenied, MovaJwtPayload, RedisService, resolveJwtSecret, UserStatus } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly moderation?: ModerationService,
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
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Compte introuvable');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Compte suspendu');
    }
    try {
      assertActiveUserStatus(user.status);
    } catch {
      throw new UnauthorizedException('Compte suspendu');
    }
    // Liste noire : invalide aussi une session déjà ouverte (réouverture app / /users/me).
    if (this.moderation) {
      const hit = await this.moderation.isBlocked({
        userId: user.id,
        phone: user.phone,
        email: user.email,
      });
      if (hit.blocked) {
        throw new UnauthorizedException(`Accès refusé (liste noire) : ${hit.reason}`);
      }
    }
    return { id: user.id, phone: user.phone, role: user.role, status: user.status, jti: payload.jti };
  }
}
