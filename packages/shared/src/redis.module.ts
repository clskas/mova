import { Global, Module, Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

function createRedisClient(url: string, label: string): Redis {
  const logger = new Logger(`Redis:${label}`);
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy: (times) => (times > 8 ? null : Math.min(times * 200, 2000)),
  });
  client.on('error', (err) => {
    logger.warn(err.message);
  });
  return client;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  readonly sub: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = createRedisClient(url, 'client');
    this.sub = createRedisClient(url, 'sub');
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
