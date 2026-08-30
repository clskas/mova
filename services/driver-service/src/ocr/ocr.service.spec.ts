import { isAllowedOcrMediaHostname, parseAllowedOcrMediaUrl } from './ocr-media-url';

describe('OCR media URL allowlist', () => {
  it('allows known SENGA / AfriSoft / Supabase hosts', () => {
    expect(isAllowedOcrMediaHostname('cdn.mova.cd')).toBe(true);
    expect(isAllowedOcrMediaHostname('api.afri-soft.com')).toBe(true);
    expect(isAllowedOcrMediaHostname('senga.afri-soft.com')).toBe(true);
    expect(isAllowedOcrMediaHostname('xyz.supabase.co')).toBe(true);
    expect(isAllowedOcrMediaHostname('gateway.local', ['gateway.local'])).toBe(true);
  });

  it('rejects arbitrary hosts (SSRF)', () => {
    expect(isAllowedOcrMediaHostname('evil.com')).toBe(false);
    expect(isAllowedOcrMediaHostname('cdn.mova.cd.evil.com')).toBe(false);
    expect(isAllowedOcrMediaHostname('169.254.169.254')).toBe(false);
    expect(isAllowedOcrMediaHostname('localhost')).toBe(false);
    expect(isAllowedOcrMediaHostname('supabase.co.attacker.test')).toBe(false);
  });

  it('rejects non-http(s) and unlisted absolute URLs', () => {
    expect(parseAllowedOcrMediaUrl('https://cdn.mova.cd/kyc/a.jpg')?.hostname).toBe('cdn.mova.cd');
    expect(parseAllowedOcrMediaUrl('https://evil.com/kyc/a.jpg')).toBeNull();
    expect(parseAllowedOcrMediaUrl('file:///etc/passwd')).toBeNull();
    expect(parseAllowedOcrMediaUrl('not a url')).toBeNull();
  });
});
