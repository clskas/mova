import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { PushTokensService } from '../push/push-tokens.service';
import { WebPushService } from '../push/web-push.service';

class RegisterPushTokenDto {
  @IsString() token!: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional()
  @IsString()
  @IsIn(['driver', 'passenger', 'restaurant', 'rental_partner'])
  appFlavor?: string;
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    private pushTokens: PushTokensService,
    private webPush: WebPushService,
  ) {}

  @Get('push/vapid-public-key')
  @ApiOperation({ summary: 'Clé publique VAPID (Web Push portails partenaires)' })
  vapidPublicKey() {
    return { publicKey: this.webPush.getPublicKey() };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes notifications' })
  list(@Request() req: { user: { id: string } }) {
    return this.notifications.list(req.user.id);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marquer comme lu' })
  read(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }

  @Post('push-tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enregistrer un token FCM (mobile) ou abonnement Web Push (portail partenaire)' })
  registerPushToken(@Request() req: { user: { id: string } }, @Body() dto: RegisterPushTokenDto) {
    return this.pushTokens.register(req.user.id, dto.token, dto.platform, dto.appFlavor ?? 'driver');
  }
}
