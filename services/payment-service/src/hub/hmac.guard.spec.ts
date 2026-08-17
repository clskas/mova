import { UnauthorizedException } from '@nestjs/common';
import { afrisoftHubSign, afrisoftHubVerifySignature } from '@mova/shared';
import { HubHmacGuard } from './hub-hmac.guard';
import { HubAppsRegistry } from './hub-apps.registry';

describe('HubHmacGuard', () => {
  const apps = {
    getApiKey: (id: string) => (id === 'senga' ? 'test-key' : undefined),
  } as unknown as HubAppsRegistry;

  const guard = new HubHmacGuard(apps);

  function req(overrides: { headers?: Record<string, string> } = {}) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ app_id: 'senga', amount_cdf: 500 });
    const sig = afrisoftHubSign('test-key', ts, 'POST', '/v1/payments', body);
    const headers: Record<string, string> = {
      'x-afrisoft-app-id': 'senga',
      'x-afrisoft-api-key': 'test-key',
      'x-afrisoft-timestamp': ts,
      'x-afrisoft-signature': sig,
      ...overrides.headers,
    };
    return {
      method: 'POST',
      originalUrl: '/v1/payments',
      url: '/v1/payments',
      rawBody: body,
      body: { app_id: 'senga', amount_cdf: 500 },
      header: (name: string) => headers[name.toLowerCase()],
    };
  }

  it('accepts a valid HMAC for POST /v1/payments', () => {
    expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => req() }) } as never)).toBe(true);
  });

  it('rejects a bad signature', () => {
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req({ headers: { 'x-afrisoft-signature': '00'.repeat(32) } }) }),
      } as never),
    ).toThrow(UnauthorizedException);
  });

  it('verifies helper round-trip', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = afrisoftHubSign('k', ts, 'GET', '/v1/payments/x', '');
    expect(afrisoftHubVerifySignature('k', ts, 'GET', '/v1/payments/x', '', sig)).toBe(true);
  });
});
