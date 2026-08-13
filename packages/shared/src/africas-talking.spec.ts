import {
  africasTalkingSendSms,
  isAfricasTalkingConfigured,
  resolveSmsBackend,
} from './africas-talking';

describe("Africa's Talking SMS", () => {
  const env: Record<string, string> = {};
  const get = (k: string) => env[k];

  beforeEach(() => {
    for (const k of Object.keys(env)) delete env[k];
    jest.restoreAllMocks();
  });

  it('is configured when username + api key set', () => {
    expect(isAfricasTalkingConfigured(get)).toBe(false);
    env.AFRICAS_TALKING_USERNAME = 'mova';
    env.AFRICAS_TALKING_API_KEY = 'k'.repeat(24);
    expect(isAfricasTalkingConfigured(get)).toBe(true);
  });

  it('prefers africastalking when SMS_PROVIDER=africastalking and AT configured', () => {
    env.SMS_PROVIDER = 'africastalking';
    env.AFRICAS_TALKING_USERNAME = 'mova';
    env.AFRICAS_TALKING_API_KEY = 'k'.repeat(24);
    expect(resolveSmsBackend(get, false)).toBe('africastalking');
  });

  it('keeps serdipay sticky when SMS_PROVIDER=serdipay even if AT configured', () => {
    env.SMS_PROVIDER = 'serdipay';
    // SerdiPay SMS credentials missing — still route to serdipay (clear error at send)
    env.AFRICAS_TALKING_USERNAME = 'mova';
    env.AFRICAS_TALKING_API_KEY = 'k'.repeat(24);
    expect(resolveSmsBackend(get, false)).toBe('serdipay');
  });

  it('keeps africastalking sticky when SMS_PROVIDER=africastalking', () => {
    env.SMS_PROVIDER = 'africastalking';
    env.SERDIPAY_SMS_API_ID = 'APISMSDEMO';
    env.SERDIPAY_SMS_API_KEY = 'sms-key';
    expect(resolveSmsBackend(get, false)).toBe('africastalking');
  });

  it('auto-detects SerdiPay SMS when SMS_PROVIDER unset', () => {
    env.SERDIPAY_SMS_API_ID = 'APISMSDEMO';
    env.SERDIPAY_SMS_API_KEY = 'sms-key';
    env.AFRICAS_TALKING_USERNAME = 'mova';
    env.AFRICAS_TALKING_API_KEY = 'k'.repeat(24);
    expect(resolveSmsBackend(get, false)).toBe('serdipay');
  });

  it('sends form POST to production messaging API', async () => {
    env.AFRICAS_TALKING_USERNAME = 'mova';
    env.AFRICAS_TALKING_API_KEY = 'secret-key';
    env.AFRICAS_TALKING_ENV = 'production';
    env.AFRICAS_TALKING_SMS_SENDER = 'MOVA';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        SMSMessageData: {
          Message: 'Sent to 1/1',
          Recipients: [{ statusCode: 101, status: 'Success' }],
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await africasTalkingSendSms(get, {
      to: '+243812345678',
      message: 'Votre code MOVA : 123456. Valide 10 minutes.',
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.africastalking.com/version1/messaging',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apiKey: 'secret-key' }),
      }),
    );
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('username')).toBe('mova');
    expect(body.get('to')).toBe('+243812345678');
    expect(body.get('from')).toBe('MOVA');
  });

  it('surfaces recipient failure status', async () => {
    env.AFRICAS_TALKING_USERNAME = 'mova';
    env.AFRICAS_TALKING_API_KEY = 'secret-key';
    env.AFRICAS_TALKING_ENV = 'production';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        SMSMessageData: {
          Message: 'Sent to 0/1',
          Recipients: [{ statusCode: 403, status: 'InvalidSenderId' }],
        },
      }),
    }) as unknown as typeof fetch;

    const result = await africasTalkingSendSms(get, {
      to: '+243812345678',
      message: 'test',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('InvalidSenderId');
  });
});
