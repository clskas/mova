describe('prod-security', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    jest.resetModules();
  });

  it('allows weak JWT in non-production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const { resolveJwtSecret } = await import('./prod-security');
    expect(resolveJwtSecret()).toBe('dev_secret');
  });

  it('rejects weak JWT in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev_secret';
    const { resolveJwtSecret } = await import('./prod-security');
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('rejects MOCK_OTP in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.INTERNAL_API_KEY = 'b'.repeat(24);
    process.env.MOCK_OTP = 'true';
    process.env.AFRICAS_TALKING_USERNAME = 'senga';
    process.env.AFRICAS_TALKING_API_KEY = 'c'.repeat(24);
    const { assertProductionSecurity } = await import('./prod-security');
    expect(() => assertProductionSecurity('test')).toThrow(/MOCK_OTP/);
  });

  it('rejects MOCK_PAYMENTS in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.INTERNAL_API_KEY = 'b'.repeat(24);
    process.env.MOCK_PAYMENTS = 'true';
    process.env.AFRICAS_TALKING_USERNAME = 'senga';
    process.env.AFRICAS_TALKING_API_KEY = 'c'.repeat(24);
    const { assertProductionSecurity } = await import('./prod-security');
    expect(() => assertProductionSecurity('payment-service')).toThrow(/MOCK_PAYMENTS/);
    expect(() => assertProductionSecurity('auth-service')).not.toThrow();
  });

  it('rejects MOCK_SMS in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.INTERNAL_API_KEY = 'b'.repeat(24);
    process.env.MOCK_OTP = 'false';
    process.env.MOCK_SMS = 'true';
    process.env.AFRICAS_TALKING_USERNAME = 'senga';
    process.env.AFRICAS_TALKING_API_KEY = 'c'.repeat(24);
    const { assertProductionSecurity } = await import('./prod-security');
    expect(() => assertProductionSecurity('test')).toThrow(/MOCK_SMS/);
  });

  it('rejects auth-service start without SMS provider', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.INTERNAL_API_KEY = 'b'.repeat(24);
    delete process.env.MOCK_OTP;
    delete process.env.MOCK_SMS;
    delete process.env.ALLOW_TEST_OTP;
    delete process.env.AFRICAS_TALKING_USERNAME;
    delete process.env.AFRICAS_TALKING_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.SERDIPAY_CLIENT_ID;
    delete process.env.SERDIPAY_CLIENT_SECRET;
    delete process.env.SERDIPAY_EMAIL;
    delete process.env.SERDIPAY_PASSWORD;
    delete process.env.SERDIPAY_SMS_PATH;
    delete process.env.SERDIPAY_SMS_API_ID;
    delete process.env.SERDIPAY_SMS_API_KEY;
    delete process.env.SMS_PROVIDER;
    const { assertProductionSecurity } = await import('./prod-security');
    expect(() => assertProductionSecurity('auth-service')).toThrow(/SMS provider/);
  });

  it('requires CORS_ORIGIN in production (returns false when unset)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    const { resolveCorsOrigin } = await import('./prod-security');
    expect(resolveCorsOrigin()).toBe(false);
  });

  it('expands https://*.onrender.com CORS token to a hostname regex', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN =
      'https://mova-web.onrender.com,https://*.onrender.com';
    const { resolveCorsOrigin } = await import('./prod-security');
    const origin = resolveCorsOrigin();
    expect(Array.isArray(origin)).toBe(true);
    const list = origin as Array<string | RegExp>;
    expect(list[0]).toBe('https://mova-web.onrender.com');
    expect(list[1]).toBeInstanceOf(RegExp);
    expect((list[1] as RegExp).test('https://mova-rental-partner.onrender.com')).toBe(true);
    expect((list[1] as RegExp).test('https://evil.com')).toBe(false);
  });

  it('isMockOtpAllowed is false in production even if MOCK_OTP=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MOCK_OTP = 'true';
    const { isMockOtpAllowed } = await import('./prod-security');
    expect(isMockOtpAllowed()).toBe(false);
  });

  it('allows auth start with ALLOW_TEST_OTP without SerdiPay', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.INTERNAL_API_KEY = 'b'.repeat(24);
    process.env.ALLOW_TEST_OTP = 'true';
    delete process.env.MOCK_OTP;
    delete process.env.MOCK_SMS;
    delete process.env.SERDIPAY_CLIENT_ID;
    delete process.env.SERDIPAY_CLIENT_SECRET;
    delete process.env.SERDIPAY_EMAIL;
    delete process.env.SERDIPAY_PASSWORD;
    delete process.env.SERDIPAY_SMS_PATH;
    delete process.env.SERDIPAY_SMS_API_ID;
    delete process.env.SERDIPAY_SMS_API_KEY;
    delete process.env.SMS_PROVIDER;
    delete process.env.AFRICAS_TALKING_USERNAME;
    delete process.env.AFRICAS_TALKING_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    const { assertProductionSecurity, isTestOtpAllowedForPhone, TEST_OTP_CODE } =
      await import('./prod-security');
    expect(() => assertProductionSecurity('auth-service')).not.toThrow();
    expect(isTestOtpAllowedForPhone('+243900000010')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243900000040')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243900000050')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243812345678')).toBe(false);
    expect(TEST_OTP_CODE).toBe('123456');
  });

  it('seed demo phones always allow 123456 even when SMS hub is live and ALLOW_TEST_OTP is off', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_TEST_OTP;
    delete process.env.MOCK_OTP;
    delete process.env.TEST_OTP_PHONES;
    process.env.AFRISOFT_SMS_HUB_URL = 'https://sms.afri-soft.com';
    process.env.AFRISOFT_HUB_API_KEY = 'hub-key';
    const { isTestOtpAllowedForPhone, isSeedDemoPhone, matchesSeedTestOtp } =
      await import('./prod-security');
    expect(isSeedDemoPhone('+243900000001')).toBe(true);
    expect(isSeedDemoPhone('243900000010')).toBe(true);
    expect(isSeedDemoPhone('+243900000030')).toBe(true);
    expect(isSeedDemoPhone('+243900000031')).toBe(true);
    expect(isSeedDemoPhone('+243812345678')).toBe(false);
    expect(isTestOtpAllowedForPhone('+243900000001')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243900000010')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243900000030')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243900000031')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243812345678')).toBe(false);
    expect(matchesSeedTestOtp('+243900000031', '123456')).toBe(true);
    expect(matchesSeedTestOtp('+243900000031', ' 123456 ')).toBe(true);
    expect(matchesSeedTestOtp('+243900000031', '000000')).toBe(false);
    expect(matchesSeedTestOtp('+243812345678', '123456')).toBe(false);
  });

  it('otpCodesToIssue stores only 123456 for seed phones (no live SMS code)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_TEST_OTP;
    delete process.env.MOCK_OTP;
    const { otpCodesToIssue, TEST_OTP_CODE } = await import('./prod-security');
    expect(otpCodesToIssue('+243900000031', '847291')).toEqual([TEST_OTP_CODE]);
    expect(otpCodesToIssue('+243812345678', '847291')).toEqual(['847291']);
  });

  it('does not treat SerdiPay payment-only credentials as SMS ready', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.INTERNAL_API_KEY = 'b'.repeat(24);
    delete process.env.ALLOW_TEST_OTP;
    delete process.env.MOCK_OTP;
    delete process.env.MOCK_SMS;
    process.env.SERDIPAY_EMAIL = 'merchant@example.com';
    process.env.SERDIPAY_PASSWORD = 'secret';
    process.env.SERDIPAY_API_ID = 'APIXXX';
    process.env.SERDIPAY_API_PASSWORD = 'pw';
    process.env.SERDIPAY_MERCHANT_CODE = '123';
    process.env.SERDIPAY_MERCHANT_PIN = '1234';
    delete process.env.SERDIPAY_SMS_PATH;
    delete process.env.SERDIPAY_SMS_API_ID;
    delete process.env.SERDIPAY_SMS_API_KEY;
    delete process.env.SMS_PROVIDER;
    delete process.env.AFRICAS_TALKING_USERNAME;
    delete process.env.AFRICAS_TALKING_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    const { assertProductionSecurity, isProductionSmsConfigured } = await import('./prod-security');
    expect(isProductionSmsConfigured()).toBe(false);
    expect(() => assertProductionSecurity('auth-service')).toThrow(/SMS provider/);
  });

  it('SMS_PROVIDER=serdipay ignores AT credentials for production readiness', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'serdipay';
    process.env.AFRICAS_TALKING_USERNAME = 'mova';
    process.env.AFRICAS_TALKING_API_KEY = 'k'.repeat(24);
    delete process.env.SERDIPAY_SMS_API_ID;
    delete process.env.SERDIPAY_SMS_API_KEY;
    const { isProductionSmsConfigured } = await import('./prod-security');
    expect(isProductionSmsConfigured()).toBe(false);

    process.env.SERDIPAY_SMS_API_ID = 'APISMSDEMO';
    process.env.SERDIPAY_SMS_API_KEY = 'sms-key';
    expect(isProductionSmsConfigured()).toBe(true);
  });

  it('treats AfriSoft SMS hub client as production SMS', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'africastalking';
    delete process.env.SERDIPAY_SMS_API_ID;
    delete process.env.SERDIPAY_SMS_API_KEY;
    delete process.env.AFRICAS_TALKING_USERNAME;
    delete process.env.AFRICAS_TALKING_API_KEY;
    process.env.AFRISOFT_SMS_HUB_URL = 'https://sms.afri-soft.com';
    process.env.AFRISOFT_HUB_APP_ID = 'senga';
    process.env.AFRISOFT_HUB_API_KEY = 'hub-key';
    const { isProductionSmsConfigured } = await import('./prod-security');
    expect(isProductionSmsConfigured()).toBe(true);
  });
});
