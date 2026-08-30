import { createHmac } from 'crypto';
import {
  afrisoftHubPaymentReference,
  afrisoftHubPublicPath,
  afrisoftHubSign,
  afrisoftHubTimestampFresh,
  afrisoftHubVerifySignature,
  afrisoftPayHubInitiate,
  afrisoftPayHubOperator,
  isAfriSoftPayHubConfigured,
} from './afrisoft-pay-hub';

describe('afrisoft-pay-hub', () => {
  it('signs HMAC per AFRISOFT_PAYMENT_HUB_API.md §3', () => {
    const ts = '1735689600';
    const body = '{"app_id":"senga"}';
    const sig = afrisoftHubSign('secret', ts, 'POST', '/v1/payments', body);
    const expected = createHmac('sha256', 'secret')
      .update(`${ts}.POST./v1/payments.${body}`)
      .digest('hex');
    expect(sig).toBe(expected);
    expect(afrisoftHubVerifySignature('secret', ts, 'POST', '/v1/payments', body, sig)).toBe(true);
    expect(afrisoftHubVerifySignature('secret', ts, 'POST', '/v1/payments', body, 'deadbeef')).toBe(false);
  });

  it('strips /api prefix for HMAC public path', () => {
    expect(afrisoftHubPublicPath('/api/v1/payments?x=1')).toBe('/v1/payments');
    expect(afrisoftHubPublicPath('/v1/payments')).toBe('/v1/payments');
  });

  it('rejects stale timestamps', () => {
    expect(afrisoftHubTimestampFresh(String(Math.floor(Date.now() / 1000)))).toBe(true);
    expect(afrisoftHubTimestampFresh('100')).toBe(false);
  });

  it('builds {app_id}_{purpose}_{uuid} references', () => {
    const ref = afrisoftHubPaymentReference('senga', 'topup', '550e8400-e29b-41d4-a716-446655440000');
    expect(ref).toBe('senga_topup_550e8400-e29b-41d4-a716-446655440000');
  });

  it('maps AF to AfriMoney, never Airtel', () => {
    expect(afrisoftPayHubOperator('AF')).toBe('AFRIMONEY');
    expect(afrisoftPayHubOperator('AFRIMONEY')).toBe('AFRIMONEY');
    expect(afrisoftPayHubOperator('AM')).toBe('AIRTEL_MONEY');
    expect(() => afrisoftPayHubOperator('UNKNOWN')).toThrow(/inconnu/i);
  });

  it('is configured only when URL + app_id + api_key are set', () => {
    const env: Record<string, string> = {};
    const get = (k: string) => env[k];
    expect(isAfriSoftPayHubConfigured(get)).toBe(false);
    env.PAY_HUB_URL = 'https://pay.afri-soft.com';
    env.AFRISOFT_HUB_APP_ID = 'senga';
    expect(isAfriSoftPayHubConfigured(get)).toBe(false);
    env.AFRISOFT_HUB_API_KEY = 'k';
    expect(isAfriSoftPayHubConfigured(get)).toBe(true);
  });

  it('POSTs /v1/payments with AfriSoft HMAC headers (never SerdiPay host)', async () => {
    const env: Record<string, string> = {
      PAY_HUB_URL: 'https://pay.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'senga',
      AFRISOFT_HUB_API_KEY: 'test-key',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        payment_id: 'pay_abc',
        status: 'PENDING',
        reference: 'senga_topup_550e8400-e29b-41d4-a716-446655440000',
        provider_ref: 'sp_1',
        amount_cdf: 500,
        telecom: 'OM',
        message: 'ok',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await afrisoftPayHubInitiate((k) => env[k], {
      amountCdf: 500,
      phone: '+243970000001',
      operator: 'ORANGE_MONEY',
      reference: 'senga_topup_550e8400-e29b-41d4-a716-446655440000',
      purpose: 'topup',
    });

    expect(result.success).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.providerRef).toBe('pay_abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pay.afri-soft.com/v1/payments');
    expect(url).not.toMatch(/serdipay/i);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-AfriSoft-App-Id']).toBe('senga');
    expect(headers['X-AfriSoft-Api-Key']).toBe('test-key');
    expect(headers['X-AfriSoft-Signature']).toMatch(/^[a-f0-9]{64}$/);
    const body = JSON.parse(String(init.body));
    expect(body.phone).toBe('243970000001');
    expect(body.telecom).toBe('OM');
    expect(body.amount_cdf).toBe(500);
  });
});
