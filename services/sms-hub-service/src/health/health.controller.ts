import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveSmsBackend } from '@mova/shared';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { AppsRegistry } from '../auth/apps.registry';

@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly apps: AppsRegistry,
  ) {}

  @Get('health')
  async health() {
    const get = (k: string) => this.config.get<string>(k);
    const provider = resolveSmsBackend(get, false) ?? 'mock';
    const mock = provider === 'mock';

    let redisOk = false;
    try {
      redisOk = (await this.redis.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }

    return {
      status: redisOk ? 'ok' : 'degraded',
      service: 'afrisoft-sms-hub',
      version: '1.0.0',
      provider,
      mock,
      mock_otp: mock || get('MOCK_OTP') === 'true',
      redis: redisOk ? 'connected' : 'disconnected',
      apps: this.apps.listAppIds(),
      timestamp: new Date().toISOString(),
    };
  }
}
