import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { assertActiveUserStatus, MovaJwtPayload, resolveJwtSecret, UserStatus } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get('JWT_SECRET')),
    });
  }

  async validate(payload: MovaJwtPayload) {
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
    return { id: user.id, phone: user.phone, role: user.role, status: user.status };
  }
}
