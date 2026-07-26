import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingSendSms,
  isProductionRuntime,
  isTwilioSmsConfigured,
  resolveSmsBackend,
} from '@mova/shared';

export interface SmsSendResult {
  success: boolean;
  message?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  private get = (key: string) => this.config.get<string>(key);

  private isMock(): boolean {
    return this.config.get('MOCK_SMS') === 'true' || this.config.get('MOCK_OTP') === 'true';
  }

  async sendMessage(phone: string, body: string): Promise<SmsSendResult> {
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
    return { success: false, message: 'SMS non configuré (Africa\'s Talking ou Twilio)' };
  }
}
