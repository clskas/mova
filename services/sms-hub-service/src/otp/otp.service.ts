import {
  Inject,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { ProviderService } from '../sms/provider.service';
import { SendOtpDto, VerifyOtpDto } from './otp.dto';
import { normalizePhoneCd } from '../common/phone.util';

type StoredOtp = {
  otp_id: string;
  app_id: string;
  phone: string;
  purpose: string;
  reference: string;
  code_hash: string;
  attempts: number;
  created_at: number;
};

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttlSec: number;
  private readonly maxAttempts: number;
  private readonly cooldownSec: number;
  private readonly maxPerPhoneWindow: number;
  private readonly windowSec: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly provider: ProviderService,
  ) {
    this.ttlSec = Number(this.config.get('OTP_TTL_SEC') || 300);
    this.maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') || 5);
    this.cooldownSec = Number(this.config.get('OTP_COOLDOWN_SEC') || 60);
    this.maxPerPhoneWindow = Number(this.config.get('OTP_MAX_PER_PHONE_WINDOW') || 5);
    this.windowSec = Number(this.config.get('OTP_RATE_WINDOW_SEC') || 900);
  }

  private hashCode(code: string): string {
    const pepper = this.config.get<string>('OTP_PEPPER') || 'afrisoft-sms-hub';
    return createHash('sha256').update(`${pepper}:${code}`).digest('hex');
  }

  private otpKey(appId: string, phone: string, reference?: string): string {
    if (reference) return `otp:ref:${appId}:${reference}`;
    return `otp:active:${appId}:${phone}`;
  }

  private async enforceRateLimit(appId: string, phone: string) {
    const coolKey = `otp:cool:${appId}:${phone}`;
    const coolTtl = await this.redis.ttl(coolKey);
    if (coolTtl > 0) {
      throw new HttpException(
        { message: 'OTP cooldown active', code: 'OTP_COOLDOWN', retry_after_sec: coolTtl },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const winKey = `otp:win:${appId}:${phone}`;
    const count = await this.redis.incr(winKey);
    if (count === 1) await this.redis.expire(winKey, this.windowSec);
    if (count > this.maxPerPhoneWindow) {
      throw new HttpException(
        {
          message: 'OTP rate limit exceeded for this phone',
          code: 'OTP_RATE_LIMIT',
          retry_after_sec: await this.redis.ttl(winKey),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async send(dto: SendOtpDto) {
    const appId = dto.app_id.trim().toLowerCase();
    const phone = normalizePhoneCd(dto.phone);
    const purpose = (dto.purpose || 'login').trim().toLowerCase() || 'login';
    const reference =
      dto.reference?.trim() ||
      `${appId}_${purpose}_${randomUUID()}`;
    const locale = (dto.locale || 'fr').trim().toLowerCase() === 'en' ? 'en' : 'fr';

    if (dto.idempotency_key?.trim()) {
      const idempKey = `otp:idemp:${appId}:${dto.idempotency_key.trim()}`;
      const cached = await this.redis.get(idempKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    await this.enforceRateLimit(appId, phone);

    const code =
      this.config.get('MOCK_FIXED_OTP') === 'true' || this.provider.activeProvider() === 'mock'
        ? this.config.get('MOCK_OTP_CODE') || '123456'
        : String(randomInt(100000, 999999));

    const otpId = `otp_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const record: StoredOtp = {
      otp_id: otpId,
      app_id: appId,
      phone,
      purpose,
      reference,
      code_hash: this.hashCode(code),
      attempts: 0,
      created_at: Date.now(),
    };

    const sendResult = await this.provider.sendOtpSms(appId, phone, code, locale);
    if (!sendResult.success) {
      throw new ServiceUnavailableException({
        message: sendResult.message || 'SMS provider unavailable',
        code: 'SMS_SEND_FAILED',
        provider: sendResult.provider,
      });
    }

    const payload = JSON.stringify(record);
    const pipe = this.redis.pipeline();
    pipe.set(this.otpKey(appId, phone, reference), payload, 'EX', this.ttlSec);
    pipe.set(this.otpKey(appId, phone), payload, 'EX', this.ttlSec);
    pipe.set(`otp:cool:${appId}:${phone}`, '1', 'EX', this.cooldownSec);
    await pipe.exec();

    const response: Record<string, unknown> = {
      otp_id: otpId,
      status: 'SENT',
      reference,
      phone_masked: this.provider.maskPhone(phone),
      expires_in_sec: this.ttlSec,
      provider: sendResult.provider,
      message: locale === 'en' ? 'Code sent.' : 'Code envoyé.',
    };

    // Controlled mock/test only — never enable with real providers in prod without ops intent.
    if (
      sendResult.provider === 'mock' &&
      this.config.get('MOCK_RETURN_CODE') === 'true'
    ) {
      response.debug_code = code;
    }

    if (dto.idempotency_key?.trim()) {
      const idempKey = `otp:idemp:${appId}:${dto.idempotency_key.trim()}`;
      await this.redis.set(idempKey, JSON.stringify(response), 'EX', Math.max(this.ttlSec, 600));
    }

    return response;
  }

  async verify(dto: VerifyOtpDto) {
    const appId = dto.app_id.trim().toLowerCase();
    const phone = normalizePhoneCd(dto.phone);
    const code = dto.code.trim();
    const key = this.otpKey(appId, phone, dto.reference?.trim());
    const raw = await this.redis.get(key);
    if (!raw) {
      return {
        verified: false,
        reason: 'INVALID_OR_EXPIRED',
        attempts_remaining: 0,
      };
    }

    const record = JSON.parse(raw) as StoredOtp;
    if (record.phone !== phone || record.app_id !== appId) {
      return { verified: false, reason: 'INVALID_OR_EXPIRED', attempts_remaining: 0 };
    }

    if (record.attempts >= this.maxAttempts) {
      await this.redis.del(key, this.otpKey(appId, phone), this.otpKey(appId, phone, record.reference));
      return { verified: false, reason: 'LOCKED', attempts_remaining: 0 };
    }

    if (record.code_hash !== this.hashCode(code)) {
      record.attempts += 1;
      const ttl = await this.redis.ttl(key);
      const remaining = Math.max(0, this.maxAttempts - record.attempts);
      if (remaining === 0) {
        await this.redis.del(key, this.otpKey(appId, phone), this.otpKey(appId, phone, record.reference));
      } else if (ttl > 0) {
        await this.redis.set(key, JSON.stringify(record), 'EX', ttl);
        await this.redis.set(this.otpKey(appId, phone), JSON.stringify(record), 'EX', ttl);
      }
      return {
        verified: false,
        reason: 'INVALID_OR_EXPIRED',
        attempts_remaining: remaining,
      };
    }

    // One-shot invalidate
    await this.redis.del(
      this.otpKey(appId, phone),
      this.otpKey(appId, phone, record.reference),
      key,
    );

    return {
      verified: true,
      otp_id: record.otp_id,
      reference: record.reference,
      purpose: record.purpose,
    };
  }
}
