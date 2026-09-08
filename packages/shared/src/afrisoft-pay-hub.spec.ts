import { createHmac } from 'crypto';
import {
  afrisoftHubPaymentReference,
  afrisoftHubPublicPath,
  afrisoftHubSign,
  afrisoftHubTimestampFresh,
  afrisoftHubVerifySignature,
  afrisoftPayHubDisburse,
  afrisoftPayHubInitiate,
  afrisoftPayHubOperator,
  isAfriSoftPayHubConfigured,
} from './afrisoft-pay-hub';
import { SERDIPAY_B2C_CHANNEL_DISABLED_FR, SERDIPAY_B2C_MERCHANT_FLOAT_LOW_FR } from './serdipay';

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

  it('forwards hub ussdCode / paymentUrl from C2B PENDING', async () => {
    const env: Record<string, string> = {
      PAY_HUB_URL: 'https://pay.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'senga',
      AFRISOFT_HUB_API_KEY: 'test-key',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        payment_id: 'pay_om',
        status: 'PENDING',
        paymentUrl: 'https://pay.example/om',
        ussdCode: '*144*4*6#',
      }),
    }) as unknown as typeof fetch;

    const result = await afrisoftPayHubInitiate((k) => env[k], {
      amountCdf: 2300,
      phone: '+243890000001',
      operator: 'ORANGE_MONEY',
      purpose: 'topup',
    });
    expect(result.success).toBe(true);
    expect(result.paymentUrl).toBe('https://pay.example/om');
    expect(result.ussdCode).toBe('*144*4*6#');
  });

  it('reads nested Nest error.message when hub returns 502', async () => {
    const env: Record<string, string> = {
      PAY_HUB_URL: 'https://pay.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'senga',
      AFRISOFT_HUB_API_KEY: 'test-key',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        success: false,
        error: {
          code: 'MOVA_INT_001',
          message:
            'Authentification marchand SerdiPay refusée. Recharge / paiement Mobile Money temporairement indisponible — contactez le support SENGA.',
        },
      }),
    }) as unknown as typeof fetch;

    const result = await afrisoftPayHubInitiate((k) => env[k], {
      amountCdf: 1000,
      phone: '+243970000001',
      operator: 'ORANGE_MONEY',
      purpose: 'topup',
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Authentification marchand SerdiPay/i);
  });

  it('POSTs /v1/payouts for B2C with telecom MP and no channel field', async () => {
    const env: Record<string, string> = {
      PAY_HUB_URL: 'https://pay.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'senga',
      AFRISOFT_HUB_API_KEY: 'test-key',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        payment_id: 'pay_payout',
        status: 'PENDING',
        reference: 'senga_withdraw_1',
        provider_ref: 'sp_payout_1',
        amount_cdf: 2300,
        telecom: 'MP',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await afrisoftPayHubDisburse((k) => env[k], {
      amountCdf: 2300,
      phone: '+243810000001',
      operator: 'MPESA',
      reference: 'senga_withdraw_1',
      purpose: 'withdraw',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pay.afri-soft.com/v1/payouts');
    const body = JSON.parse(String(init.body));
    expect(body.telecom).toBe('MP');
    expect(body.currency).toBe('CDF');
    expect(body.purpose).toBe('withdraw');
    expect(body).not.toHaveProperty('channel');
  });

  it('sanitizes hub English channel0 on B2C failure (even if VPS still leaks it)', async () => {
    const env: Record<string, string> = {
      PAY_HUB_URL: 'https://pay.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'senga',
      AFRISOFT_HUB_API_KEY: 'test-key',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: {
          code: 'HUB_PROVIDER_FAILED',
          message: 'Payment Failed, Merchant is not allowed to use this channel0',
        },
      }),
    }) as unknown as typeof fetch;

    const result = await afrisoftPayHubDisburse((k) => env[k], {
      amountCdf: 2300,
      phone: '+243810000001',
      operator: 'MPESA',
      purpose: 'withdraw',
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe(SERDIPAY_B2C_CHANNEL_DISABLED_FR);
    expect(result.message).not.toMatch(/channel0/i);
  });

  it('sanitizes hub English merchant-float on B2C failure', async () => {
    const env: Record<string, string> = {
      PAY_HUB_URL: 'https://pay.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'senga',
      AFRISOFT_HUB_API_KEY: 'test-key',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: { code: 'HUB_PROVIDER_FAILED', message: 'Your Balance is low' },
      }),
    }) as unknown as typeof fetch;

    const result = await afrisoftPayHubDisburse((k) => env[k], {
      amountCdf: 2300,
      phone: '+243970000001',
      operator: 'ORANGE_MONEY',
      purpose: 'withdraw',
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe(SERDIPAY_B2C_MERCHANT_FLOAT_LOW_FR);
    expect(result.message).not.toMatch(/Your Balance is low/i);
  });
});
