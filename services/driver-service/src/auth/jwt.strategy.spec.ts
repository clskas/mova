import { ConfigService } from '@nestjs/config';
import { JwtStrategy, authUserCacheMs } from './jwt.strategy';

describe('driver JwtStrategy user cache', () => {
  const payload = { sub: 'u1', phone: '+243900000001', role: 'DRIVER', status: 'ACTIVE', jti: 'j1' } as never;
  const config = { get: () => 'test-secret-test-secret-test-secret-123' } as unknown as ConfigService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    delete process.env.AUTH_USER_CACHE_MS;
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'u1', phone: '+243900000001', role: 'DRIVER', status: 'ACTIVE' }),
    }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  it('asks auth-service once, then reuses the answer (GPS every 8 s)', async () => {
    const s = new JwtStrategy(config);
    const a = await s.validate(payload);
    const b = await s.validate(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toMatchObject({ id: 'u1', role: 'DRIVER', jti: 'j1' });
  });

  it('asks again once the cache delay is over', async () => {
    process.env.AUTH_USER_CACHE_MS = '0';
    const s = new JwtStrategy(config);
    await s.validate(payload);
    await new Promise((r) => setTimeout(r, 5));
    await s.validate(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never caches a suspended user', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'u1', role: 'DRIVER', status: 'SUSPENDED' }),
    }));
    const s = new JwtStrategy(config);
    await expect(s.validate(payload)).rejects.toThrow('Compte suspendu');
    await expect(s.validate(payload)).rejects.toThrow('Compte suspendu');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('defaults to 30 s', () => {
    expect(authUserCacheMs()).toBe(30_000);
  });
});
