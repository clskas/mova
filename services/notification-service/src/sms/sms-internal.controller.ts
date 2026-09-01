import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { InternalApiGuard } from '../common/internal-api.guard';
import { SmsService } from './sms.service';
import { NotificationsService } from '../notifications/notifications.service';

class SendSmsDto {
  @IsString() phone!: string;
  @IsString() text!: string;
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class SmsInternalController {
  constructor(
    private sms: SmsService,
    private notifications: NotificationsService,
  ) {}

  @Post('sms')
  send(@Body() dto: SendSmsDto) {
    return this.sms.sendMessage(dto.phone, dto.text);
  }

  @Delete('users/:userId/data')
  purgeUserData(@Param('userId') userId: string) {
    return this.notifications.purgeUserData(userId);
  }
}
