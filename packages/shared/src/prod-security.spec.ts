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
    const { assertProductionSecurity } = await import('./prod-security');
    expect(() => assertProductionSecurity('auth-service')).toThrow(/SMS provider/);
  });

  it('requires CORS_ORIGIN in production (returns false when unset)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    const { resolveCorsOrigin } = await import('./prod-security');
    expect(resolveCorsOrigin()).toBe(false);
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
    delete process.env.AFRICAS_TALKING_USERNAME;
    delete process.env.AFRICAS_TALKING_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    const { assertProductionSecurity, isTestOtpAllowedForPhone, TEST_OTP_CODE } =
      await import('./prod-security');
    expect(() => assertProductionSecurity('auth-service')).not.toThrow();
    expect(isTestOtpAllowedForPhone('+243900000010')).toBe(true);
    expect(isTestOtpAllowedForPhone('+243812345678')).toBe(false);
    expect(TEST_OTP_CODE).toBe('123456');
  });
});
