import { AUTH_IP_LIMIT, AuthRateLimitMiddleware } from './auth-rate-limit.middleware';

const KEY = 'k'.repeat(32);

function call(mw: AuthRateLimitMiddleware, headers: Record<string, string>) {
  let status = 200;
  let passed = false;
  const res = { setHeader: () => res, status: (s: number) => ((status = s), res), json: () => res } as never;
  mw.use({ method: 'POST', originalUrl: '/api/auth/otp/request', headers, ip: '1.2.3.4' } as never, res, () => {
    passed = true;
  });
  return passed ? 200 : status;
}

describe('AuthRateLimitMiddleware and the staging load test key', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('lets the load test through on staging, past the per-IP limit', () => {
    process.env.APP_ENV = 'staging';
    process.env.LOAD_TEST_KEY = KEY;
    const mw = new AuthRateLimitMiddleware();
    for (let i = 0; i < AUTH_IP_LIMIT + 5; i++) expect(call(mw, { 'x-senga-load-test': KEY })).toBe(200);
  });

  it('still limits everyone else (and production even with the key)', () => {
    process.env.APP_ENV = 'production';
    process.env.LOAD_TEST_KEY = KEY;
    const mw = new AuthRateLimitMiddleware();
    let last = 200;
    for (let i = 0; i < AUTH_IP_LIMIT + 1; i++) last = call(mw, { 'x-senga-load-test': KEY });
    expect(last).toBe(429);
  });
});
