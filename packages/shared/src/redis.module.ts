import { Global, Module, Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

function createRedisClient(url: string, label: string): Redis {
  const logger = new Logger(`Redis:${label}`);
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    // Fail fast on commands while disconnected; callers should catch.
    enableOfflineQueue: false,
    // Never stop reconnecting — free-tier Redis may sleep and come back.
    retryStrategy: (times) => Math.min(times * 200, 5000),
    reconnectOnError: (err) => {
      const msg = err.message || '';
      return msg.includes('READONLY') || msg.includes('ECONNRESET');
    },
  });
  client.on('error', (err) => {
    logger.warn(err.message);
  });
  client.on('reconnecting', () => {
    logger.warn('reconnecting…');
  });
  client.on('connect', () => {
    logger.log('connected');
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
