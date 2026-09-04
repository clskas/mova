import {
  mapSerdiPayPaymentFailure,
  mapSerdiPayTokenFailure,
  SERDIPAY_MIN_AMOUNT_CDF,
  __resetSerdiPayTokenCache,
  isSerdiPayAuthConfigured,
  isSerdiPayPaymentConfigured,
  isSerdiPaySmsConfigured,
  serdiPayDisburseMobileMoney,
  serdiPayGetAccessToken,
  serdiPayInitiateMobileMoney,
  serdiPayNormalizePhone,
  serdiPayNormalizeSmsPhone,
  serdiPaySanitizeSmsText,
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
    expect(serdiPayNormalizeSmsPhone('+243994972450')).toBe('+243994972450');
    expect(serdiPayNormalizeSmsPhone('0994972450')).toBe('+243994972450');
    expect(serdiPaySanitizeSmsText('Votre code SENGA : 111111. Valide 10 minutes.')).toBe(
      'Votre code SENGA : 111111 Valide 10 minutes',
    );
    expect(serdiPaySanitizeSmsText('RECU Token Montant 50.00 USD No.Jeton 12')).toBe(
      'RECU Token Montant 50.00 USD No.Jeton 12',
    );
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
    env.SERDIPAY_MERCHANT_CODE = '466551';
    env.SERDIPAY_MERCHANT_PIN = '1234';
    // No SERDIPAY_API_PASSWORD: merchant sheet uses portal Password as api_password
    expect(isSerdiPayPaymentConfigured(get)).toBe(true);
    expect(useSerdiPayMobileMoney(get)).toBe(true);
  });

  it('uses portal Password as api_password when SERDIPAY_API_PASSWORD is unset', async () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'portal-pw';
    env.SERDIPAY_API_ID = 'APIX';
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
        json: async () => ({ message: 'ok', payment: { status: 'pending', transactionId: 'TX1' } }),
      });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await serdiPayInitiateMobileMoney(get, {
      operator: 'AIRTEL_MONEY',
      amountCdf: 400,
      phone: '+243994972450',
      reference: 'topup_ref_fallback',
    });
    const payBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(payBody.api_password).toBe('portal-pw');
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

  it('C2B posts payment-merchant body with telecom codes (Word C2B route)', async () => {
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
    expect(payCall[0]).toBe('https://serdipay.com/api/public-api/v1/merchant/payment-merchant');
    expect(JSON.parse(payCall[1].body)).toEqual({
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

  it('B2C posts payment-client (Word B2C route)', async () => {
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
        json: async () => ({ message: 'ok', payment: { transactionId: 'SERDPAY' } }),
      });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await serdiPayDisburseMobileMoney(get, {
      operator: 'MPESA',
      amountCdf: 500,
      phone: '0994972450',
      reference: 'payout_ref_1',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://serdipay.com/api/public-api/v1/merchant/payment-client',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).telecom).toBe('MP');
  });

  it('refuses SMS when SERDIPAY_SMS_API_ID/KEY unset', async () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'secret';
    const result = await serdiPaySendSms(get, { to: '+243900000010', message: 'OTP 123456' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Impossible d'envoyer le code par SMS/);
    expect(result.message).not.toMatch(/SERDIPAY_/);
    expect(isSerdiPaySmsConfigured(get)).toBe(false);
  });

  it('maps SerdiPay 402 amount-range errors to French min/max copy', () => {
    expect(SERDIPAY_MIN_AMOUNT_CDF).toBe(2300);
    expect(
      mapSerdiPayPaymentFailure(
        402,
        'Failed to process the payment',
        'Payment Failed, The amount is not within allowed range! min: 2300 -  max : 5750000 CDF',
      ),
    ).toMatch(/minimum 2[\s\u202f]?300 FC/i);
    expect(mapSerdiPayPaymentFailure(402, 'Failed to process the payment')).toMatch(/2[\s\u202f]?300/);
  });

  it('maps get-token failures away from debit-style solde copy', () => {
    expect(mapSerdiPayTokenFailure(400, 'Failed to get the token')).toMatch(/Authentification marchand/);
  });

  it('surfaces SerdiPay C2B 402 amount detail instead of generic Failed to process', async () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'portal-pw';
    env.SERDIPAY_API_ID = 'APIX';
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
        ok: false,
        status: 402,
        json: async () => ({
          message: 'Failed to process the payment',
          error: 'Payment Failed, The amount is not within allowed range! min: 2300 -  max : 5750000 CDF',
        }),
      });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await serdiPayInitiateMobileMoney(get, {
      operator: 'ORANGE_MONEY',
      amountCdf: 500,
      phone: '+243970000001',
      reference: 'senga_topup_test',
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/minimum 2[\s\u202f]?300 FC/i);
    expect(result.message).not.toMatch(/Failed to process/i);
  });

  it('posts SMS body per sms-api.pdf (apiId, apiKey, phone, senderId, text)', async () => {
    env.SERDIPAY_SMS_API_ID = 'APISMSDEMO';
    env.SERDIPAY_SMS_API_KEY = 'test-sms-key';
    env.SERDIPAY_SMS_SENDER_ID = 'SerdiPay';
    env.SERDIPAY_SMS_BASE_URL = 'https://serdipay.com';
    expect(isSerdiPaySmsConfigured(get)).toBe(true);

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'SMS sent successfully.', data: { sms_api_id: 2 } }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await serdiPaySendSms(get, {
      to: '0994972450',
      message: 'Votre code MOVA : 123456. Valide 10 minutes.',
    });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/SMS sent successfully/);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://serdipay.com/api/sms-api/v1/send',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      apiId: 'APISMSDEMO',
      apiKey: 'test-sms-key',
      phone: '+243994972450',
      senderId: 'SerdiPay',
      text: 'Votre code MOVA : 123456 Valide 10 minutes',
    });
    // No Bearer / get-token for SMS API
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps get-token 400 to French merchant-auth message (no C2B call)', async () => {
    env.SERDIPAY_EMAIL = 'm@example.com';
    env.SERDIPAY_PASSWORD = 'pw';
    env.SERDIPAY_API_ID = 'APIX';
    env.SERDIPAY_MERCHANT_CODE = '466551';
    env.SERDIPAY_MERCHANT_PIN = '1234';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        message: 'Failed to get the token',
        error: 'Something went wrong, Please Try later',
      }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const auth = await serdiPayGetAccessToken(get);
    expect(auth.ok).toBe(false);
    if (auth.ok === false) {
      expect(auth.message).toMatch(/Authentification marchand SerdiPay/i);
      expect(auth.message).not.toMatch(/Failed to get the token/i);
    }

    const mm = await serdiPayInitiateMobileMoney(get, {
      operator: 'ORANGE_MONEY',
      amountCdf: 500,
      phone: '+243970000001',
      reference: 'senga_topup_test',
    });
    expect(mm.success).toBe(false);
    expect(mm.message).toMatch(/Authentification marchand SerdiPay/i);
    // Only get-token, never payment-merchant
    expect(fetchMock).toHaveBeenCalledTimes(2); // token attempted twice (no cache on failure)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/get-token/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/get-token/);
  });

  it('surfaces 403 credit errors from SMS API', async () => {
    env.SERDIPAY_SMS_API_ID = 'APISMSDEMO';
    env.SERDIPAY_SMS_API_KEY = 'test-sms-key';
    (global as unknown as { fetch: typeof fetch }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'not enough sms' }),
    }) as unknown as typeof fetch;

    const result = await serdiPaySendSms(get, { to: '+243812345678', message: 'hi' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Crédit SMS|not enough sms/i);
  });

  it('accepts SERDIPAY_SMS_SENDER alias for senderId', async () => {
    env.SERDIPAY_SMS_API_ID = 'APISMSDEMO';
    env.SERDIPAY_SMS_API_KEY = 'test-sms-key';
    env.SERDIPAY_SMS_SENDER = 'SerdiPay';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'SMS sent successfully.' }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    await serdiPaySendSms(get, { to: '+243812345678', message: 'hi' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.senderId).toBe('SerdiPay');
  });
});
