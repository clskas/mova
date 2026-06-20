import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  success: boolean;
  message?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  private isMock(): boolean {
    return this.config.get('MOCK_SMS') === 'true' || this.config.get('MOCK_OTP') === 'true';
  }

  private twilioConfigured(): boolean {
    return Boolean(
      this.config.get('TWILIO_ACCOUNT_SID') &&
        this.config.get('TWILIO_AUTH_TOKEN') &&
        this.config.get('TWILIO_PHONE_NUMBER'),
    );
  }

  async sendMessage(phone: string, body: string): Promise<SmsSendResult> {
    if (this.isMock()) {
      this.logger.log(`[MOCK SMS] → ${phone}: ${body}`);
      return { success: true, message: 'SMS simulé (MOCK_SMS)' };
    }
    if (!this.twilioConfigured()) {
      this.logger.warn(`SMS skipped (Twilio non configuré): ${phone}`);
      return { success: false, message: 'SMS non configuré' };
    }
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
}
