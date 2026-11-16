import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/** On when SOCKET_REDIS_ADAPTER=true and a Redis URL is set (pure, tested). */
export function socketRedisAdapterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SOCKET_REDIS_ADAPTER === 'true' && Boolean(env.REDIS_URL);
}

/**
 * Real time across several ride-service instances: a driver's position or a ride status sent
 * by one instance reaches the passenger connected to another one (Redis pub/sub).
 * Turned on with SOCKET_REDIS_ADAPTER=true, together with the second instance and a paid Redis
 * plan; off (single instance), it behaves exactly like the default adapter.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RedisIoAdapter');
  private adapter: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(url: string): Promise<void> {
    const pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    pub.on('error', (e) => this.logger.warn(`redis pub: ${e.message}`));
    sub.on('error', (e) => this.logger.warn(`redis sub: ${e.message}`));
    await Promise.all([pub.connect(), sub.connect()]);
    this.adapter = createAdapter(pub, sub);
    this.logger.log('Socket.IO Redis adapter on (multi-instance real time)');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapter) server.adapter(this.adapter);
    return server;
  }
}
