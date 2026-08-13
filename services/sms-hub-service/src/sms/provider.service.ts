import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingSendSms,
  resolveSmsBackend,
  serdiPaySendSms,
  type SmsBackend,
} from '@mova/shared';

export type HubSmsResult = { success: boolean; message?: string; provider: SmsBackend };

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(private readonly config: ConfigService) {}

  private get = (key: string) => this.config.get<string>(key);

  activeProvider(): SmsBackend {
    return resolveSmsBackend(this.get, false) ?? 'mock';
  }

  brandName(appId: string): string {
    const mapRaw = this.get('APP_BRAND_NAMES') || '';
    for (const part of mapRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [id, name] = part.split(':');
      if (id?.trim().toLowerCase() === appId.toLowerCase() && name?.trim()) return name.trim();
    }
    const defaults: Record<string, string> = { senga: 'SENGA', educongo: 'Educongo' };
    return defaults[appId.toLowerCase()] || appId;
  }

  async sendOtpSms(appId: string, phone: string, code: string, locale = 'fr'): Promise<HubSmsResult> {
    const provider = this.activeProvider();
    const brand = this.brandName(appId);
    const message =
      locale === 'en'
        ? `Your ${brand} code: ${code}. Valid 5 minutes.`
        : `Votre code ${brand} : ${code}. Valide 5 minutes.`;

    if (provider === 'mock') {
      // Intentional in MOCK hub bootstrap — codes appear only in server logs, not in API (unless MOCK_RETURN_CODE).
      this.logger.log(`[MOCK SMS] OTP → ${this.maskPhone(phone)} code=${code} app=${appId}`);
      return { success: true, message: 'OTP mocked (SMS_PROVIDER=mock)', provider: 'mock' };
    }

    if (provider === 'africastalking') {
      const result = await africasTalkingSendSms(this.get, { to: phone, message });
      if (!result.success) this.logger.warn(`AT SMS failed: ${result.message}`);
      return { success: result.success, message: result.message, provider };
    }

    if (provider === 'serdipay') {
      const result = await serdiPaySendSms(this.get, { to: phone, message });
      if (!result.success) this.logger.warn(`SerdiPay SMS failed: ${result.message}`);
      return { success: result.success, message: result.message, provider };
    }

    throw new ServiceUnavailableException({
      message: `SMS provider '${provider}' not supported yet on hub`,
      code: 'SMS_PROVIDER_UNSUPPORTED',
    });
  }

  async sendTransactional(appId: string, phone: string, text: string): Promise<HubSmsResult> {
    const provider = this.activeProvider();
    if (provider === 'mock') {
      this.logger.log(`[MOCK SMS] text → ${this.maskPhone(phone)} app=${appId} len=${text.length}`);
      return { success: true, message: 'SMS mocked', provider: 'mock' };
    }
    if (provider === 'africastalking') {
      const result = await africasTalkingSendSms(this.get, { to: phone, message: text });
      return { success: result.success, message: result.message, provider };
    }
    if (provider === 'serdipay') {
      const result = await serdiPaySendSms(this.get, { to: phone, message: text });
      return { success: result.success, message: result.message, provider };
    }
    throw new ServiceUnavailableException({
      message: `SMS provider '${provider}' not supported`,
      code: 'SMS_PROVIDER_UNSUPPORTED',
    });
  }

  maskPhone(phone: string): string {
    const p = phone.replace(/\D/g, '');
    if (p.length < 8) return '***';
    return `${p.slice(0, 3)}****${p.slice(-4)}`;
  }
}
