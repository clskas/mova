import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  africasTalkingSendSms,
  isSeedDemoPhone,
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

  private redundantOtpEnabled(): boolean {
    const raw = (this.get('SMS_OTP_REDUNDANT_SEND') || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private isOtpPurpose(purpose?: string): boolean {
    const p = (purpose || '').trim().toLowerCase();
    return p === 'login' || p === 'otp' || p === 'auth' || p === 'verify';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Optional second identical send for login/otp (~1.5s later).
   * Keep OFF on CD/SerdiPay: double-send correlates with non-delivery while a
   * single direct probe with the same text arrives. Enable only if a provider
   * needs it (`SMS_OTP_REDUNDANT_SEND=1`).
   */
  private async maybeRedundantSend(
    provider: SmsBackend,
    phone: string,
    text: string,
    purpose: string | undefined,
    first: HubSmsResult,
  ): Promise<void> {
    if (!first.success || !this.redundantOtpEnabled() || !this.isOtpPurpose(purpose)) return;
    await this.sleep(1500);
    try {
      if (provider === 'africastalking') {
        await africasTalkingSendSms(this.get, { to: phone, message: text });
      } else if (provider === 'serdipay') {
        await serdiPaySendSms(this.get, { to: phone, message: text });
      }
      this.logger.log(`OTP redundant SMS sent → ${this.maskPhone(phone)}`);
    } catch (e) {
      this.logger.warn(`OTP redundant SMS failed: ${(e as Error).message}`);
    }
  }

  async sendOtpSms(appId: string, phone: string, code: string, locale = 'fr'): Promise<HubSmsResult> {
    if (isSeedDemoPhone(phone)) {
      this.logger.warn(`Skip OTP SMS for seed phone ${this.maskPhone(phone)} app=${appId}`);
      return { success: true, message: 'OTP skipped (seed phone)', provider: 'mock' };
    }
    const provider = this.activeProvider();
    const brand = this.brandName(appId);
    // Same copy as mova-auth — word `code` helps iOS Messages QuickType autofill.
    const message = `${brand} code ${code}`;

    if (provider === 'mock') {
      // Intentional in MOCK hub bootstrap — codes appear only in server logs, not in API (unless MOCK_RETURN_CODE).
      this.logger.log(`[MOCK SMS] OTP sent (code omitted) → ${this.maskPhone(phone)} app=${appId}`);
      return { success: true, message: 'OTP mocked (SMS_PROVIDER=mock)', provider: 'mock' };
    }

    if (provider === 'africastalking') {
      const result = await africasTalkingSendSms(this.get, { to: phone, message });
      if (!result.success) this.logger.warn(`AT SMS failed: ${result.message}`);
      const out = { success: result.success, message: result.message, provider };
      await this.maybeRedundantSend(provider, phone, message, 'login', out);
      return out;
    }

    if (provider === 'serdipay') {
      const result = await serdiPaySendSms(this.get, { to: phone, message });
      if (!result.success) this.logger.warn(`SerdiPay SMS failed: ${result.message}`);
      const out = { success: result.success, message: result.message, provider };
      await this.maybeRedundantSend(provider, phone, message, 'login', out);
      return out;
    }

    throw new ServiceUnavailableException({
      message: `SMS provider '${provider}' not supported yet on hub`,
      code: 'SMS_PROVIDER_UNSUPPORTED',
    });
  }

  async sendTransactional(
    appId: string,
    phone: string,
    text: string,
    purpose?: string,
  ): Promise<HubSmsResult> {
    if (isSeedDemoPhone(phone)) {
      this.logger.warn(`Skip SMS for seed phone ${this.maskPhone(phone)} app=${appId}`);
      return { success: true, message: 'SMS skipped (seed phone)', provider: 'mock' };
    }
    const provider = this.activeProvider();
    if (provider === 'mock') {
      this.logger.log(`[MOCK SMS] text → ${this.maskPhone(phone)} app=${appId} len=${text.length}`);
      return { success: true, message: 'SMS mocked', provider: 'mock' };
    }
    if (provider === 'africastalking') {
      const result = await africasTalkingSendSms(this.get, { to: phone, message: text });
      const out = { success: result.success, message: result.message, provider };
      await this.maybeRedundantSend(provider, phone, text, purpose, out);
      return out;
    }
    if (provider === 'serdipay') {
      this.logger.log(
        `SMS send → ${this.maskPhone(phone)} purpose=${purpose || 'n/a'} text="${text.slice(0, 48)}"`,
      );
      const result = await serdiPaySendSms(this.get, { to: phone, message: text });
      const out = { success: result.success, message: result.message, provider };
      if (!result.success) this.logger.warn(`SerdiPay SMS failed: ${result.message}`);
      await this.maybeRedundantSend(provider, phone, text, purpose, out);
      return out;
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
