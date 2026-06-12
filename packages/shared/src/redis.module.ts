import { Global, Module, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  readonly sub: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url);
    this.sub = new Redis(url);
  }

  async publish(channel: string, payload: object) {
    await this.client.publish(channel, JSON.stringify(payload));
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.sub.quit();
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
