import { createHmac } from 'crypto';
import {
  afrisoftSmsHubSendOtp,
  afrisoftSmsHubSendSms,
  isAfrisoftSmsHubClientConfigured,
} from './afrisoft-sms-hub';

describe('afrisoft-sms-hub', () => {
  it('is configured only when URL + api_key are set', () => {
    const env: Record<string, string> = {};
    const get = (k: string) => env[k];
    expect(isAfrisoftSmsHubClientConfigured(get)).toBe(false);
    env.AFRISOFT_SMS_HUB_URL = 'https://sms.afri-soft.com';
    env.AFRISOFT_HUB_APP_ID = 'senga';
    expect(isAfrisoftSmsHubClientConfigured(get)).toBe(false);
    env.AFRISOFT_HUB_API_KEY = 'k';
    expect(isAfrisoftSmsHubClientConfigured(get)).toBe(true);
  });

  it('POSTs /v1/sms/send with AfriSoft HMAC (SENGA OTP transport)', async () => {
    const env: Record<string, string> = {
      AFRISOFT_SMS_HUB_URL: 'https://sms.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'senga',
      AFRISOFT_HUB_API_KEY: 'test-key',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sms_id: 'sms_abc',
        status: 'SENT',
        reference: 'senga_login_ref',
        provider: 'serdipay',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await afrisoftSmsHubSendSms((k) => env[k], {
      phone: '+243970000001',
      text: 'Votre code SENGA : 482913. Valide 10 minutes.',
      purpose: 'login',
      reference: 'senga_login_ref',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('serdipay');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sms.afri-soft.com/v1/sms/send');
    expect(url).not.toMatch(/serdipay/i);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-AfriSoft-App-Id']).toBe('senga');
    expect(headers['X-AfriSoft-Api-Key']).toBe('test-key');
    const body = String(init.body);
    const ts = headers['X-AfriSoft-Timestamp'];
    const expected = createHmac('sha256', 'test-key')
      .update(`${ts}.POST./v1/sms/send.${body}`)
      .digest('hex');
    expect(headers['X-AfriSoft-Signature']).toBe(expected);
    expect(JSON.parse(body).phone).toBe('243970000001');
    expect(JSON.parse(body).text).toMatch(/482913/);
  });

  it('POSTs /v1/otp/send for multi-app OTP', async () => {
    const env: Record<string, string> = {
      AFRISOFT_SMS_HUB_URL: 'https://sms.afri-soft.com',
      AFRISOFT_HUB_APP_ID: 'educongo',
      AFRISOFT_HUB_API_KEY: 'edu-key',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        otp_id: 'otp_01',
        status: 'SENT',
        provider: 'serdipay',
        message: 'Code envoyé.',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await afrisoftSmsHubSendOtp((k) => env[k], {
      phone: '243970000001',
      purpose: 'login',
    });
    expect(result.success).toBe(true);
    expect(result.otpId).toBe('otp_01');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sms.afri-soft.com/v1/otp/send');
  });
});
