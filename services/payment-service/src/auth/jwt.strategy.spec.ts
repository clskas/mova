import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@mova/shared';
import { JwtStrategy } from './jwt.strategy';

describe('Payment JwtStrategy fail-closed', () => {
  const config = { get: jest.fn().mockReturnValue('dev_secret') };
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_REVALIDATE_TIMEOUT_MS = '30';
    jest.clearAllMocks();
    strategy = new JwtStrategy(config as never);
  });

  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch;
    delete process.env.AUTH_REVALIDATE_TIMEOUT_MS;
  });

  it('returns live claims from auth-service', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'user-1',
        phone: '+243811111111',
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
      }),
    }) as jest.Mock;
    const result = await strategy.validate({
      sub: 'user-1',
      phone: '+243811111111',
      role: UserRole.PASSENGER,
      status: UserStatus.ACTIVE,
    });
    expect(result).toMatchObject({
      id: 'user-1',
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
    });
  });

  it('returns 503 when auth-service is unreachable (no stale claims)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as jest.Mock;
    await expect(
      strategy.validate({ sub: 'user-1', role: UserRole.PASSENGER, status: UserStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns 503 when auth-service times out', async () => {
    global.fetch = jest.fn().mockImplementation((_url: string, init: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as jest.Mock;
    await expect(
      strategy.validate({ sub: 'user-1', role: UserRole.PASSENGER, status: UserStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns 503 when auth-service is 5xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as jest.Mock;
    await expect(
      strategy.validate({ sub: 'user-1', role: UserRole.PASSENGER, status: UserStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a suspended user from live auth data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'user-1',
        role: UserRole.PASSENGER,
        status: UserStatus.SUSPENDED,
      }),
    }) as jest.Mock;
    await expect(
      strategy.validate({ sub: 'user-1', role: UserRole.PASSENGER, status: UserStatus.ACTIVE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
