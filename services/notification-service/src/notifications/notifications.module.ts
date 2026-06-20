import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsService } from '../sms/sms.service';
@Module({ controllers: [NotificationsController], providers: [NotificationsService, SmsService] })
export class NotificationsModule {}
