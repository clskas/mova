import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  success: boolean;
  message?: string;
}

export interface SmsProvider {
  readonly name: string;
  sendOtp(phone: string, code: string): Promise<SmsSendResult>;
  isConfigured(): boolean;
}

@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly name = 'MOCK';
  private readonly logger = new Logger(MockSmsProvider.name);

  isConfigured(): boolean {
    return true;
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    this.logger.log(`[MOCK SMS] OTP ${code} → ${phone}`);
    return { success: true, message: 'Code OTP simulé (mode développement)' };
  }
}

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'TWILIO';
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('TWILIO_ACCOUNT_SID') &&
        this.config.get('TWILIO_AUTH_TOKEN') &&
        (this.config.get('TWILIO_VERIFY_SERVICE_SID') || this.config.get('TWILIO_PHONE_NUMBER')),
    );
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        message:
          'Service SMS non configuré. Définissez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_PHONE_NUMBER (ou TWILIO_VERIFY_SERVICE_SID).',
      };
    }

    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID')!;
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN')!;
    const verifySid = this.config.get<string>('TWILIO_VERIFY_SERVICE_SID');
    const from = this.config.get<string>('TWILIO_PHONE_NUMBER');

    try {
      if (verifySid) {
        const res = await fetch(`https://verify.twilio.com/v2/Services/${verifySid}/Verifications`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: phone, Channel: 'sms' }),
        });
        if (!res.ok) {
          const body = await res.text();
          this.logger.warn(`Twilio Verify failed: ${res.status} ${body}`);
          return { success: false, message: 'Échec envoi SMS via Twilio Verify. Vérifiez la configuration.' };
        }
        return { success: true, message: 'Code OTP envoyé par SMS' };
      }

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: from!,
          Body: `Votre code MOVA : ${code}. Valide 10 minutes.`,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Twilio SMS failed: ${res.status} ${body}`);
        return { success: false, message: 'Échec envoi SMS. Vérifiez TWILIO_PHONE_NUMBER et les crédits Twilio.' };
      }
      return { success: true, message: 'Code OTP envoyé par SMS' };
    } catch (e) {
      this.logger.error('Twilio SMS unreachable', e);
      return { success: false, message: 'Service SMS temporairement indisponible.' };
    }
  }
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private config: ConfigService,
    private mock: MockSmsProvider,
    private twilio: TwilioSmsProvider,
  ) {}

  private resolveProvider(): SmsProvider {
    if (this.config.get('MOCK_OTP') === 'true') return this.mock;
    if (this.twilio.isConfigured()) return this.twilio;
    return this.mock;
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    const provider = this.resolveProvider();
    const result = await provider.sendOtp(phone, code);
    if (!result.success && this.config.get('MOCK_OTP') !== 'true') {
      this.logger.error(`SMS OTP failed (${provider.name}): ${result.message}`);
    }
    return result;
  }

  isProductionReady(): boolean {
    return this.config.get('MOCK_OTP') !== 'true' && this.twilio.isConfigured();
  }
}
