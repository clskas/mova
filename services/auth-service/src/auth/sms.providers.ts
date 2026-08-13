import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingSendSms,
  isAfricasTalkingConfigured,
  isMockOtpAllowed,
  isProductionRuntime,
  isSerdiPaySmsConfigured,
  isTwilioSmsConfigured,
  resolveSmsBackend,
  serdiPaySendSms,
} from '@mova/shared';

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
    if (isProductionRuntime() || !isMockOtpAllowed()) {
      this.logger.error('[MOCK SMS] refused outside non-prod MOCK_OTP mode');
      return {
        success: false,
        message: 'Service SMS non configuré. Configurez SerdiPay (ou Africa\'s Talking / Twilio).',
      };
    }
    // Dev-only: code is intentional for local login; never enabled in production.
    this.logger.log(`[MOCK SMS] OTP ${code} → ${phone}`);
    return { success: true, message: 'Code OTP simulé (mode développement)' };
  }
}

@Injectable()
export class SerdiPaySmsProvider implements SmsProvider {
  readonly name = 'SERDIPAY';
  private readonly logger = new Logger(SerdiPaySmsProvider.name);

  constructor(private config: ConfigService) {}

  private get = (key: string) => this.config.get<string>(key);

  isConfigured(): boolean {
    return isSerdiPaySmsConfigured(this.get);
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    const result = await serdiPaySendSms(this.get, {
      to: phone,
      message: `Votre code MOVA : ${code}. Valide 10 minutes.`,
    });
    if (!result.success) this.logger.warn(`SerdiPay SMS: ${result.message}`);
    return result;
  }
}

@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly name = 'AFRICASTALKING';
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);

  constructor(private config: ConfigService) {}

  private get = (key: string) => this.config.get<string>(key);

  isConfigured(): boolean {
    return isAfricasTalkingConfigured(this.get);
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    const result = await africasTalkingSendSms(this.get, {
      to: phone,
      message: `Votre code MOVA : ${code}. Valide 10 minutes.`,
    });
    if (!result.success) this.logger.warn(`Africa's Talking SMS: ${result.message}`);
    return result;
  }
}

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'TWILIO';
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return isTwilioSmsConfigured((key) => this.config.get<string>(key));
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        message:
          'Service SMS Twilio non configuré. Définissez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_PHONE_NUMBER.',
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
          return { success: false, message: 'Échec envoi SMS via Twilio Verify.' };
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
        return { success: false, message: 'Échec envoi SMS Twilio.' };
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
    private serdiPay: SerdiPaySmsProvider,
    private africasTalking: AfricasTalkingSmsProvider,
    private twilio: TwilioSmsProvider,
  ) {}

  private get = (key: string) => this.config.get<string>(key);

  private resolveProvider(): SmsProvider | null {
    const backend = resolveSmsBackend(this.get, isMockOtpAllowed());
    if (backend === 'mock') return this.mock;
    if (backend === 'serdipay') return this.serdiPay;
    if (backend === 'africastalking') return this.africasTalking;
    if (backend === 'twilio') return this.twilio;
    return null;
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    const provider = this.resolveProvider();
    if (!provider) {
      this.logger.error('SMS OTP failed: no provider configured');
      return {
        success: false,
        message:
          'Service SMS non configuré. Définissez SMS_PROVIDER=serdipay + SERDIPAY_SMS_API_ID / SERDIPAY_SMS_API_KEY, ou SMS_PROVIDER=africastalking + AFRICAS_TALKING_*.',
      };
    }
    const result = await provider.sendOtp(phone, code);
    if (!result.success && this.config.get('MOCK_OTP') !== 'true') {
      this.logger.error(`SMS OTP failed (${provider.name}): ${result.message}`);
    }
    return result;
  }

  isProductionReady(): boolean {
    if (isMockOtpAllowed()) return false;
    const provider = this.resolveProvider();
    if (!provider || provider.name === 'MOCK') return false;
    return provider.isConfigured();
  }
}
