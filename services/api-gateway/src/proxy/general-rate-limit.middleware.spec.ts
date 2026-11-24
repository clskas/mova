import { GeneralRateLimitMiddleware, generalIpLimit } from './general-rate-limit.middleware';

function call(mw: GeneralRateLimitMiddleware, path: string, ip: string) {
  let status = 200;
  let passed = false;
  const res = { setHeader: () => res, status: (s: number) => ((status = s), res), json: () => res } as never;
  mw.use({ method: 'GET', originalUrl: path, headers: { 'cf-connecting-ip': ip }, ip: '10.0.0.1' } as never, res, () => {
    passed = true;
  });
  return passed ? 200 : status;
}

describe('GeneralRateLimitMiddleware', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('limits one address past the ceiling, without touching other addresses', () => {
    process.env.GATEWAY_IP_RATE_LIMIT = '5';
    const mw = new GeneralRateLimitMiddleware();
    for (let i = 0; i < 5; i++) expect(call(mw, '/api/rides/offers', '41.0.0.1')).toBe(200);
    expect(call(mw, '/api/rides/offers', '41.0.0.1')).toBe(429);
    expect(call(mw, '/api/rides/offers', '41.0.0.2')).toBe(200);
  });

  it('never throttles Mobile Money callbacks', () => {
    process.env.GATEWAY_IP_RATE_LIMIT = '1';
    const mw = new GeneralRateLimitMiddleware();
    for (let i = 0; i < 5; i++) expect(call(mw, '/api/payments/webhooks/serdipay', '41.0.0.3')).toBe(200);
  });

  it('defaults to a generous ceiling', () => {
    delete process.env.GATEWAY_IP_RATE_LIMIT;
    expect(generalIpLimit()).toBe(1500);
  });
});
