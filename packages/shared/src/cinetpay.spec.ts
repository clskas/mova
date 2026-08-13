import {
  cinetPayBuildHmacPayload,
  cinetPayCheckTransaction,
  cinetPayGenerateXToken,
  cinetPayInitiateMobileMoney,
  cinetPayMapCheckStatus,
  cinetPayNormalizeAmount,
  cinetPayNormalizePhone,
  cinetPayPaymentMethod,
  cinetPaySanitizeDescription,
  cinetPayTransactionIdFromProviderRef,
  cinetPayVerifyXToken,
  isCinetPayConfigured,
  useCinetPayMobileMoney,
} from './cinetpay';

describe('cinetpay Checkout API', () => {
  const env: Record<string, string> = {};
  const get = (k: string) => env[k];

  beforeEach(() => {
    for (const k of Object.keys(env)) delete env[k];
    jest.restoreAllMocks();
  });

  it('normalizes phone, amount (×5), payment methods and description', () => {
    expect(cinetPayNormalizePhone('+243994972450')).toBe('+243994972450');
    expect(cinetPayNormalizePhone('0994972450')).toBe('+243994972450');
    expect(cinetPayNormalizeAmount(501)).toBe(505);
    expect(cinetPayNormalizeAmount(500)).toBe(500);
    expect(cinetPayPaymentMethod('ORANGE_MONEY', 'CDF')).toBe('OMCD');
    expect(cinetPayPaymentMethod('MPESA', 'CDF')).toBe('MPESACD');
    expect(cinetPayPaymentMethod('AIRTEL_MONEY', 'CDF')).toBe('AIRTELCD');
    expect(cinetPayPaymentMethod('OM', 'USD')).toBe('OMCDUSD');
    expect(cinetPaySanitizeDescription('Pay #topup_ref/$1&x')).toBe('Pay topup ref 1 x');
    expect(cinetPayTransactionIdFromProviderRef('cp_topup_1')).toBe('topup_1');
  });

  it('requires api key + site id; sticky MOBILE_MONEY_GATEWAY=cinetpay', () => {
    expect(isCinetPayConfigured(get)).toBe(false);
    expect(useCinetPayMobileMoney(get)).toBe(false);
    env.CINETPAY_API_KEY = 'test-key';
    env.CINETPAY_SITE_ID = '10555';
    expect(isCinetPayConfigured(get)).toBe(true);
    expect(useCinetPayMobileMoney(get)).toBe(false);
    env.MOBILE_MONEY_GATEWAY = 'cinetpay';
    expect(useCinetPayMobileMoney(get)).toBe(true);
    env.MOBILE_MONEY_GATEWAY = 'serdipay';
    expect(useCinetPayMobileMoney(get)).toBe(false);
  });

  it('builds HMAC x-token in documented field order', () => {
    const fields = {
      cpm_site_id: '10555',
      cpm_trans_id: 'tx1',
      cpm_trans_date: '2026-08-13 12:00:00',
      cpm_amount: '500',
      cpm_currency: 'CDF',
      signature: 'sig',
      payment_method: 'OMCD',
      cel_phone_num: '994972450',
      cpm_phone_prefixe: '243',
      cpm_language: 'fr',
      cpm_version: 'V4',
      cpm_payment_config: 'Single',
      cpm_page_action: 'Payment',
      cpm_custom: 'meta',
      cpm_designation: 'desc',
      cpm_error_message: 'SUCCESS',
    };
    const payload = cinetPayBuildHmacPayload(fields);
    expect(payload).toBe(
      '10555tx12026-08-13 12:00:00500CDFsigOMCD994972450243frV4SinglePaymentmetadescSUCCESS',
    );
    const token = cinetPayGenerateXToken('secret', fields);
    expect(token).toHaveLength(64);
    expect(cinetPayVerifyXToken('secret', fields, token)).toBe(true);
    expect(cinetPayVerifyXToken('secret', fields, 'deadbeef')).toBe(false);
  });

  it('maps check statuses', () => {
    expect(cinetPayMapCheckStatus('ACCEPTED')).toBe('ACCEPTED');
    expect(cinetPayMapCheckStatus('REFUSED')).toBe('REFUSED');
    expect(cinetPayMapCheckStatus('WAITING_CUSTOMER_PAYMENT')).toBe('PENDING');
  });

  it('init posts checkout payload with MOBILE_MONEY + locked phone', async () => {
    env.CINETPAY_API_KEY = 'test-key';
    env.CINETPAY_SITE_ID = '10555';
    env.CINETPAY_NOTIFY_URL = 'https://pay.afri-soft.com/webhooks/cinetpay';
    env.CINETPAY_RETURN_URL = 'https://pay.afri-soft.com/return';
    env.MOBILE_MONEY_GATEWAY = 'cinetpay';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        code: '201',
        message: 'CREATED',
        data: {
          payment_token: 'tok123',
          payment_url: 'https://checkout.cinetpay.com/payment/tok123',
        },
      }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const result = await cinetPayInitiateMobileMoney(get, {
      operator: 'ORANGE_MONEY',
      amountCdf: 501,
      phone: '0994972450',
      reference: 'topup_ORANGE_MONEY_1',
    });

    expect(result.success).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.providerRef).toBe('cp_topup_ORANGE_MONEY_1');
    expect(result.paymentUrl).toContain('checkout.cinetpay.com');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-checkout.cinetpay.com/v2/payment',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      apikey: 'test-key',
      site_id: 10555,
      transaction_id: 'topup_ORANGE_MONEY_1',
      amount: 505,
      currency: 'CDF',
      channels: 'MOBILE_MONEY',
      customer_phone_number: '+243994972450',
      lock_phone_number: true,
      notify_url: 'https://pay.afri-soft.com/webhooks/cinetpay',
    });
    expect(body.description).not.toMatch(/[#/$&_]/);
  });

  it('refuses init when notify URL missing', async () => {
    env.CINETPAY_API_KEY = 'test-key';
    env.CINETPAY_SITE_ID = '10555';
    const result = await cinetPayInitiateMobileMoney(get, {
      operator: 'MPESA',
      amountCdf: 1000,
      phone: '+243812345678',
      reference: 'ref1',
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/CINETPAY_NOTIFY_URL/);
  });

  it('check posts transaction_id to /v2/payment/check', async () => {
    env.CINETPAY_API_KEY = 'test-key';
    env.CINETPAY_SITE_ID = '10555';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: '00',
        message: 'SUCCES',
        data: { status: 'ACCEPTED', amount: '1000', currency: 'CDF', payment_method: 'OMCD' },
      }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const checked = await cinetPayCheckTransaction(get, 'cp_topup_1');
    expect(checked.ok).toBe(true);
    expect(checked.status).toBe('ACCEPTED');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      apikey: 'test-key',
      site_id: 10555,
      transaction_id: 'topup_1',
    });
  });
});
