import { validatePhoneRdc, normalizePhoneRdc, formatCdf } from './market-rdc.config';

describe('Market RDC Config', () => {
  it('should validate +243 phone numbers', () => {
    expect(validatePhoneRdc('+243812345678')).toBe(true);
    expect(validatePhoneRdc('+33123456789')).toBe(false);
  });

  it('should normalize local phone to +243', () => {
    expect(normalizePhoneRdc('0812345678')).toBe('+243812345678');
    expect(normalizePhoneRdc('243812345678')).toBe('+243812345678');
  });

  it('should format CDF amounts', () => {
    const formatted = formatCdf(12500);
    expect(formatted).toContain('FC');
  });
});
