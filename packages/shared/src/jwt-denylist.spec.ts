import { denyJwtJti, denyJwtUser, isJwtDenied, JWT_DENY_JTI_PREFIX, JWT_DENY_USER_PREFIX } from './jwt-denylist';

function mockRedis() {
  return {
    client: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    },
  };
}

describe('jwt denylist', () => {
  it('stores jti and user denylist keys', async () => {
    const redis = mockRedis();
    await denyJwtJti(redis as never, 'jti-1');
    await denyJwtUser(redis as never, 'user-1');
    expect(redis.client.set).toHaveBeenCalledWith(`${JWT_DENY_JTI_PREFIX}jti-1`, '1', 'EX', expect.any(Number));
    expect(redis.client.set).toHaveBeenCalledWith(`${JWT_DENY_USER_PREFIX}user-1`, '1', 'EX', expect.any(Number));
  });

  it('reports denied jti or user', async () => {
    const redis = mockRedis();
    redis.client.get.mockImplementation(async (key: string) =>
      key.endsWith('jti-1') || key.endsWith('user-9') ? '1' : null,
    );
    await expect(isJwtDenied(redis as never, { jti: 'jti-1', sub: 'u' })).resolves.toBe(true);
    await expect(isJwtDenied(redis as never, { jti: 'other', sub: 'user-9' })).resolves.toBe(true);
    await expect(isJwtDenied(redis as never, { jti: 'ok', sub: 'ok' })).resolves.toBe(false);
  });

  it('fail-opens when Redis is down', async () => {
    const redis = mockRedis();
    redis.client.get.mockRejectedValue(new Error('redis down'));
    await expect(isJwtDenied(redis as never, { jti: 'jti-1', sub: 'u' })).resolves.toBe(false);
  });
});
