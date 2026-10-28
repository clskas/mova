import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsService } from '../sms/sms.service';
import { SmsInternalController } from '../sms/sms-internal.controller';
import { FcmPushService } from '../push/fcm-push.service';
import { PushTokensService } from '../push/push-tokens.service';
import { WebPushService } from '../push/web-push.service';
import { StaffAlertsService } from '../staff-alerts/staff-alerts.service';
import { StaffAlertsInternalController } from '../staff-alerts/staff-alerts.internal.controller';

@Module({
  controllers: [NotificationsController, SmsInternalController, StaffAlertsInternalController],
  providers: [
    NotificationsService,
    SmsService,
    FcmPushService,
    WebPushService,
    PushTokensService,
    StaffAlertsService,
  ],
  exports: [FcmPushService, WebPushService, PushTokensService, StaffAlertsService],
})
export class NotificationsModule {}
