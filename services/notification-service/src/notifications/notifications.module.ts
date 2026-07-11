import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsService } from '../sms/sms.service';
import { FcmPushService } from '../push/fcm-push.service';
import { PushTokensService } from '../push/push-tokens.service';
import { WebPushService } from '../push/web-push.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsService, FcmPushService, WebPushService, PushTokensService],
  exports: [FcmPushService, WebPushService, PushTokensService],
})
export class NotificationsModule {}
