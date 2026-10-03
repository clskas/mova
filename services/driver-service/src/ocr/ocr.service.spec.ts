import { isAllowedOcrMediaHostname, parseAllowedOcrMediaUrl, parseUploadsMediaPath } from './ocr-media-url';

describe('parseUploadsMediaPath', () => {
  it('parses relative and absolute upload paths', () => {
    expect(parseUploadsMediaPath('/api/uploads/kyc/abc.jpg')).toEqual({
      category: 'kyc',
      filename: 'abc.jpg',
    });
    expect(parseUploadsMediaPath('/uploads/kyc/abc.jpg')).toEqual({
      category: 'kyc',
      filename: 'abc.jpg',
    });
    expect(parseUploadsMediaPath('https://cdn.mova.cd/api/uploads/kyc/abc.jpg')).toEqual({
      category: 'kyc',
      filename: 'abc.jpg',
    });
  });

  it('returns null for non-upload URLs', () => {
    expect(parseUploadsMediaPath('https://xyz.supabase.co/storage/v1/object/sign/kyc/a.jpg')).toBeNull();
    expect(parseUploadsMediaPath('')).toBeNull();
  });
});

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
