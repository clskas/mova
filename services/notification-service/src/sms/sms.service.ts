import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingSendSms,
  afrisoftSmsHubSendSms,
  isAfrisoftSmsHubClientConfigured,
  INTERNAL_API_KEY,
  isProductionRuntime,
  serviceUrl,
  isTwilioSmsConfigured,
  resolveSmsBackend,
  serdiPaySendSms,
  translateServerText,
  type AppLanguage,
} from '@mova/shared';

export interface SmsSendResult {
  success: boolean;
  message?: string;
}

const NOTIFICATION_SMS_SWITCH_TTL_MS = 60_000;
let notificationSmsSwitch: { on: boolean; at: number } | null = null;

/**
 * Super admin switch « SMS de notification » (admin › Alertes SOS › SMS payants), read from the
 * client-apps config (sosSms.notificationSms) and kept one minute. Off when unreachable.
 */
export async function isNotificationSmsSwitchOn(now = Date.now()): Promise<boolean> {
  if (process.env.SMS_NOTIFICATIONS_ENABLED === 'true') return true;
  if (notificationSmsSwitch && now - notificationSmsSwitch.at < NOTIFICATION_SMS_SWITCH_TTL_MS) {
    return notificationSmsSwitch.on;
  }
  let on = false;
  try {
    const res = await fetch(serviceUrl('ride', '/internal/client-apps-config'), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { sosSms?: { notificationSms?: unknown } };
      on = data?.sosSms?.notificationSms === true;
    }
  } catch {
    on = notificationSmsSwitch?.on ?? false;
  }
  notificationSmsSwitch = { on, at: now };
  return on;
}

/** Tests only. */
export function resetNotificationSmsSwitchCache() {
  notificationSmsSwitch = null;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  private get = (key: string) => this.config.get<string>(key);

  private isMock(): boolean {
    return this.config.get('MOCK_SMS') === 'true' || this.config.get('MOCK_OTP') === 'true';
  }

  /** [language]: the recipient's app language; French texts are translated when it is not French. */
  async sendMessage(
    phone: string,
    body: string,
    language?: AppLanguage,
    opts?: { sos?: boolean },
  ): Promise<SmsSendResult> {
    // SMS cost money: notifications go through the app (push + in-app) unless the super admin
    // turns « SMS de notification » on. SOS alerts have their own switches (fetchSosSmsConfig).
    if (opts?.sos !== true && !(await isNotificationSmsSwitchOn())) {
      this.logger.log('Notification SMS not sent: switch « SMS de notification » is off');
      return { success: false, message: 'Notifications SMS désactivées (application uniquement).' };
    }
    if (language && language !== 'fr') body = translateServerText(body, language);
    if (this.isMock()) {
      if (isProductionRuntime()) {
        this.logger.error('[MOCK SMS] refused in production');
        return { success: false, message: 'SMS mock interdit en production' };
      }
      // Dev-only: may contain OTP-like content — never enabled in production.
      this.logger.log(`[MOCK SMS] → ${phone}: ${body}`);
      return { success: true, message: 'SMS simulé (MOCK_SMS)' };
    }

    const backend = resolveSmsBackend(this.get, false);
    if (isAfrisoftSmsHubClientConfigured(this.get)) {
      const result = await afrisoftSmsHubSendSms(this.get, {
        phone,
        text: body,
        purpose: 'notify',
      });
      if (!result.success) this.logger.warn(`SMS hub: ${result.message}`);
      return result;
    }

    if (backend === 'serdipay') {
      const result = await serdiPaySendSms(this.get, { to: phone, message: body });
      if (!result.success) this.logger.warn(`SerdiPay SMS: ${result.message}`);
      return result;
    }

    if (backend === 'africastalking') {
      const result = await africasTalkingSendSms(this.get, { to: phone, message: body });
      if (!result.success) this.logger.warn(`Africa's Talking SMS: ${result.message}`);
      return result;
    }

    if (backend === 'twilio' && isTwilioSmsConfigured(this.get)) {
      const sid = this.config.get<string>('TWILIO_ACCOUNT_SID')!;
      const token = this.config.get<string>('TWILIO_AUTH_TOKEN')!;
      const from = this.config.get<string>('TWILIO_PHONE_NUMBER')!;
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: phone, From: from, Body: body }),
        });
        if (!res.ok) {
          const text = await res.text();
          this.logger.warn(`Twilio SMS failed: ${res.status} ${text}`);
          return { success: false, message: 'Échec envoi SMS' };
        }
        return { success: true, message: 'SMS envoyé' };
      } catch (e) {
        this.logger.error('Twilio unreachable', e);
        return { success: false, message: 'SMS indisponible' };
      }
    }

    this.logger.warn(`SMS skipped (non configuré): ${phone}`);
    return { success: false, message: 'SMS non configuré (SerdiPay, Africa\'s Talking ou Twilio)' };
  }
}
