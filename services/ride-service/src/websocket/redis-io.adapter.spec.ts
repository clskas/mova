import { socketRedisAdapterEnabled } from './redis-io.adapter';

describe('socketRedisAdapterEnabled', () => {
  it('is off by default (single instance)', () => {
    expect(socketRedisAdapterEnabled({ REDIS_URL: 'redis://x' })).toBe(false);
  });
  it('needs both the switch and a Redis URL', () => {
    expect(socketRedisAdapterEnabled({ SOCKET_REDIS_ADAPTER: 'true' })).toBe(false);
    expect(socketRedisAdapterEnabled({ SOCKET_REDIS_ADAPTER: 'true', REDIS_URL: 'redis://x' })).toBe(true);
  });
});
