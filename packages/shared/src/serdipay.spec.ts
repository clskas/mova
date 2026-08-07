import {
  __resetSerdiPayTokenCache,
  isSerdiPayAuthConfigured,
  isSerdiPayPaymentConfigured,
  isSerdiPaySmsConfigured,
  serdiPayGetAccessToken,
  serdiPayInitiateMobileMoney,
  serdiPayNormalizePhone,
  serdiPaySendSms,
  serdiPayTelecomCode,
  useSerdiPayMobileMoney,
} from './serdipay';

describe('serdipay Public API', () => {
  const env: Record<string, string> = {};
  const get = (k: string) => env[k];

  beforeEach(() => {
    for (const k of Object.keys(env)) delete env[k];
    __resetSerdiPayTokenCache();
    jest.restoreAllMocks();
  });

  it('normalizes phones and telecom codes per doc', () => {
    expect(serdiPayNormalizePhone('+243994972450')).toBe('243994972450');
    expect(serdiPayNormalizePhone('0994972450')).toBe('243994972450');
    expect(serdiPayTelecomCode('AIRTEL_MONEY')).toBe('AM');
    expect(serdiPayTelecomCode('ORANGE_MONEY')).toBe('OM');
    expect(serdiPayTelecomCode('MPESA')).toBe('MP');
  });

  it('requires full payment credentials for MM gateway', () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'pw';
    expect(isSerdiPayAuthConfigured(get)).toBe(true);
    expect(isSerdiPayPaymentConfigured(get)).toBe(false);
    expect(useSerdiPayMobileMoney(get)).toBe(false);
    expect(isSerdiPaySmsConfigured(get)).toBe(false);

    env.SERDIPAY_API_ID = 'APIX';
    env.SERDIPAY_API_PASSWORD = 'apipw';
    env.SERDIPAY_MERCHANT_CODE = '466551';
    env.SERDIPAY_MERCHANT_PIN = '1234';
    expect(isSerdiPayPaymentConfigured(get)).toBe(true);
    expect(useSerdiPayMobileMoney(get)).toBe(true);
  });

  it('accepts legacy CLIENT_ID / CLIENT_SECRET aliases for auth', () => {
    env.SERDIPAY_CLIENT_ID = 'legacy@example.com';
    env.SERDIPAY_CLIENT_SECRET = 'legacy-pw';
    expect(isSerdiPayAuthConfigured(get)).toBe(true);
  });

  it('get-token posts JSON email/password to Public API path', async () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'secret';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'tok-abc' }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const auth = await serdiPayGetAccessToken(get);
    expect(auth).toEqual({ ok: true, token: 'tok-abc' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://serdipay.com/api/public-api/v1/merchant/get-token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'm@example.com', password: 'secret' }),
      }),
    );
  });

  it('C2B posts payment-client body with telecom codes', async () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'secret';
    env.SERDIPAY_API_ID = 'APIX';
    env.SERDIPAY_API_PASSWORD = 'apipw';
    env.SERDIPAY_MERCHANT_CODE = '466551';
    env.SERDIPAY_MERCHANT_PIN = '1234';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok-abc' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 102,
        json: async () => ({ message: 'topup_ref_1', payment: { status: 'pending', transactionId: 'SERDXYZ' } }),
      });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await serdiPayInitiateMobileMoney(get, {
      operator: 'AIRTEL_MONEY',
      amountCdf: 400,
      phone: '+243994972450',
      reference: 'topup_ref_1',
    });
    expect(result.success).toBe(true);
    expect(result.providerRef).toBe('sp_SERDXYZ');
    const payCall = fetchMock.mock.calls[1];
    expect(payCall[0]).toBe('https://serdipay.com/api/public-api/v1/merchant/payment-client');
    expect(JSON.parse(payCall[1].body)).toMatchObject({
      api_id: 'APIX',
      api_password: 'apipw',
      merchantCode: '466551',
      merchant_pin: '1234',
      clientPhone: '243994972450',
      amount: 400,
      currency: 'CDF',
      telecom: 'AM',
    });
  });

  it('refuses SMS when SERDIPAY_SMS_PATH unset', async () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'secret';
    const result = await serdiPaySendSms(get, { to: '+243900000010', message: 'OTP 123456' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/SMS SerdiPay non activé/);
  });
});
