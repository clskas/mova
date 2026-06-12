/* eslint-disable */
module.exports.writeAll = function writeAll(w) {
  w('services/notification-service/src/common/internal-api.guard.ts', `import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY } from '@mova/shared';
@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    return ctx.switchToHttp().getRequest().headers['x-internal-api-key'] === INTERNAL_API_KEY;
  }
}
`);

  w('services/notification-service/src/auth/jwt-auth.guard.ts', `import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
`);

  w('services/notification-service/src/auth/jwt.strategy.ts', `import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: config.get('JWT_SECRET') ?? 'dev_secret' });
  }
  validate(payload: { sub: string }) { return { id: payload.sub }; }
}
`);

  w('services/notification-service/src/auth/auth.module.ts', `import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.registerAsync({ imports: [ConfigModule], useFactory: (c: ConfigService) => ({ secret: c.get('JWT_SECRET') ?? 'dev_secret' }), inject: [ConfigService] })],
  providers: [JwtStrategy],
})
export class AuthModule {}
`);

  w('services/notification-service/src/notifications/notifications.service.ts', `import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MOVA_EVENTS, PaymentCompletedPayload, RideCreatedPayload } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  onModuleInit() {
    this.redis.sub.subscribe(MOVA_EVENTS.RIDE_CREATED, MOVA_EVENTS.PAYMENT_COMPLETED);
    this.redis.sub.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        if (channel === MOVA_EVENTS.RIDE_CREATED) await this.onRideCreated(data as RideCreatedPayload);
        if (channel === MOVA_EVENTS.PAYMENT_COMPLETED) await this.onPaymentCompleted(data as PaymentCompletedPayload);
      } catch (e) {
        this.logger.error('Event handler error', e);
      }
    });
  }

  async create(userId: string, title: string, body: string, type: string, data?: object) {
    return this.prisma.notification.create({ data: { userId, title, body, type, data: data ?? {} } });
  }

  async onRideCreated(payload: RideCreatedPayload) {
    await this.create(payload.passengerId, 'Course créée', 'Recherche de chauffeur en cours à Kinshasa', 'RIDE_CREATED', payload);
    this.logger.log(\`ride.created notification for \${payload.rideId}\`);
  }

  async onPaymentCompleted(payload: PaymentCompletedPayload) {
    await this.create(payload.userId, 'Paiement confirmé', \`Paiement de \${payload.amountCdf} FC effectué\`, 'PAYMENT_COMPLETED', payload);
    this.logger.log(\`payment.completed notification for ride \${payload.rideId}\`);
  }

  list(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }); }
  markRead(id: string) { return this.prisma.notification.update({ where: { id }, data: { read: true } }); }
}
`);

  w('services/notification-service/src/notifications/notifications.controller.ts', `import { Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}
  @Get() @ApiOperation({ summary: 'Mes notifications' }) list(@Request() req: { user: { id: string } }) { return this.notifications.list(req.user.id); }
  @Patch(':id/read') @ApiOperation({ summary: 'Marquer comme lu' }) read(@Param('id') id: string) { return this.notifications.markRead(id); }
}
`);

  w('services/notification-service/src/notifications/notifications.module.ts', `import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
@Module({ controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
`);

  w('services/notification-service/src/app.module.ts', `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, PrismaModule, HealthModule, AuthModule, NotificationsModule] })
export class AppModule {}
`);
};
