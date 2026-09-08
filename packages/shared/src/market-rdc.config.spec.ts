import {
  validatePhoneRdc,
  normalizePhoneRdc,
  formatCdf,
  isEmailLoginHandle,
  parseLoginHandle,
  rdcC2bPendingUserMessageFr,
  rdcMobileMoneyOperatorMismatchFr,
} from './market-rdc.config';

describe('Market RDC Config', () => {
  it('should validate +243 phone numbers', () => {
    expect(validatePhoneRdc('+243812345678')).toBe(true);
    expect(validatePhoneRdc('+33123456789')).toBe(false);
  });

  it('should normalize local phone to +243', () => {
    expect(normalizePhoneRdc('0812345678')).toBe('+243812345678');
    expect(normalizePhoneRdc('243812345678')).toBe('+243812345678');
    expect(normalizePhoneRdc('+243 81 234 5678')).toBe('+243812345678');
    expect(normalizePhoneRdc('+2430812345678')).toBe('+243812345678');
    expect(normalizePhoneRdc('00243812345678')).toBe('+243812345678');
    expect(normalizePhoneRdc('812345678')).toBe('+243812345678');
    expect(normalizePhoneRdc('+243-900-000-031')).toBe('+243900000031');
    expect(normalizePhoneRdc(undefined as unknown as string)).toBe('');
    expect(normalizePhoneRdc(null as unknown as string)).toBe('');
  });

  it('rejects Orange Money on an Airtel MSISDN (USSD would not open on the Orange SIM)', () => {
    expect(rdcMobileMoneyOperatorMismatchFr('ORANGE_MONEY', '+243970000001')).toMatch(/Orange Money/i);
    expect(rdcMobileMoneyOperatorMismatchFr('ORANGE_MONEY', '+243840000001')).toBeNull();
    expect(rdcMobileMoneyOperatorMismatchFr('AIRTEL_MONEY', '+243970000001')).toBeNull();
  });

  it('should format CDF amounts', () => {
    const formatted = formatCdf(12500);
    expect(formatted).toContain('FC');
  });

  it('parses PIN login handles as email, +243, or userId — never garbage', () => {
    expect(isEmailLoginHandle('marie@gmail.com')).toBe(true);
    expect(isEmailLoginHandle('marie@gmailcom')).toBe(true);
    expect(isEmailLoginHandle('+243812345678')).toBe(false);
    expect(parseLoginHandle('marie@gmail.com')).toEqual({ kind: 'email', value: 'marie@gmail.com' });
    expect(parseLoginHandle('Marie@Gmail.com')).toEqual({ kind: 'email', value: 'marie@gmail.com' });
    expect(parseLoginHandle('+243 81 234 5678')).toEqual({ kind: 'phone', value: '+243812345678' });
    expect(parseLoginHandle(undefined, 'a1b2c3d4-e5f6-47a8-9abc-def012345678')).toEqual({
      kind: 'userId',
      value: 'a1b2c3d4-e5f6-47a8-9abc-def012345678',
    });
    expect(parseLoginHandle('not-a-phone')).toBeNull();
    expect(parseLoginHandle('+243')).toBeNull();
    expect(parseLoginHandle('')).toBeNull();
    expect(parseLoginHandle(undefined, 'nope')).toBeNull();
  });

  it('does not promise *144# when Orange C2B has no aggregator prompt', () => {
    const msg = rdcC2bPendingUserMessageFr({
      operator: 'ORANGE_MONEY',
      amountLabel: '2 700 FC',
      phone: '+243893515173',
    });
    expect(msg).toMatch(/SerdiPay/);
    expect(msg).toMatch(/Orange Money/);
    expect(msg).toMatch(/M-Pesa|Airtel/);
    expect(msg).not.toMatch(/\*144#/);
    expect(msg).not.toMatch(/composeur/);
  });

  it('keeps the gateway message when SerdiPay returns a USSD or URL', () => {
    expect(
      rdcC2bPendingUserMessageFr({
        operator: 'ORANGE_MONEY',
        amountLabel: '2 700 FC',
        phone: '+243893515173',
        gatewayMessage: 'Ouvrez le code Orange',
        ussdCode: '*144*4*6#',
      }),
    ).toBe('Ouvrez le code Orange');
  });

  it('rejects a Vodacom MSISDN for Orange Money C2B (USSD would not hit the Orange SIM)', () => {
    expect(rdcMobileMoneyOperatorMismatchFr('ORANGE_MONEY', '+243812345678')).toMatch(/Orange Money/);
    expect(rdcMobileMoneyOperatorMismatchFr('ORANGE_MONEY', '+243890000001')).toBeNull();
    expect(rdcMobileMoneyOperatorMismatchFr('ORANGE_MONEY', 'marie@gmail.com')).toMatch(/invalide|e-mail/i);
    expect(rdcMobileMoneyOperatorMismatchFr('MPESA', '+243812345678')).toBeNull();
  });
});
