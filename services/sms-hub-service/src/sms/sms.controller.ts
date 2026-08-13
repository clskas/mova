import { Body, Controller, Post, UseGuards, ServiceUnavailableException, Inject } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { HmacGuard } from '../auth/hmac.guard';
import { SendSmsDto } from '../otp/otp.dto';
import { ProviderService } from './provider.service';
import { REDIS } from '../redis/redis.module';
import { normalizePhoneCd } from '../common/phone.util';

@Controller('v1/sms')
@UseGuards(HmacGuard)
export class SmsController {
  constructor(
    private readonly provider: ProviderService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Post('send')
  async send(@Body() dto: SendSmsDto) {
    const appId = dto.app_id.trim().toLowerCase();
    const phone = normalizePhoneCd(dto.phone);
    const reference = dto.reference?.trim() || `${appId}_notify_${randomUUID()}`;

    if (dto.idempotency_key?.trim()) {
      const idempKey = `sms:idemp:${appId}:${dto.idempotency_key.trim()}`;
      const cached = await this.redis.get(idempKey);
      if (cached) return JSON.parse(cached);
    }

    const result = await this.provider.sendTransactional(appId, phone, dto.text);
    if (!result.success) {
      throw new ServiceUnavailableException({
        message: result.message || 'SMS send failed',
        code: 'SMS_SEND_FAILED',
        provider: result.provider,
      });
    }

    const smsId = `sms_${createHash('sha256').update(`${appId}:${reference}:${Date.now()}`).digest('hex').slice(0, 16)}`;
    const response = {
      sms_id: smsId,
      status: 'SENT' as const,
      reference,
      provider: result.provider,
      phone_masked: this.provider.maskPhone(phone),
    };

    if (dto.idempotency_key?.trim()) {
      await this.redis.set(
        `sms:idemp:${appId}:${dto.idempotency_key.trim()}`,
        JSON.stringify(response),
        'EX',
        600,
      );
    }
    return response;
  }
}
