import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { PushTokensService } from '../push/push-tokens.service';

class RegisterPushTokenDto {
  @IsString() token!: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() appFlavor?: string;
}

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    private pushTokens: PushTokensService,
  ) {}
  @Get() @ApiOperation({ summary: 'Mes notifications' }) list(@Request() req: { user: { id: string } }) { return this.notifications.list(req.user.id); }
  @Patch(':id/read') @ApiOperation({ summary: 'Marquer comme lu' }) read(@Param('id') id: string) { return this.notifications.markRead(id); }
  @Post('push-tokens')
  @ApiOperation({ summary: 'Enregistrer un token FCM (app chauffeur)' })
  registerPushToken(@Request() req: { user: { id: string } }, @Body() dto: RegisterPushTokenDto) {
    return this.pushTokens.register(req.user.id, dto.token, dto.platform, dto.appFlavor ?? 'driver');
  }
}
