import { createHash } from 'crypto';
import { hashOtpCode } from './otp-code.util';

describe('hashOtpCode', () => {
  it('stores SHA-256 hex of the digits (not plaintext)', () => {
    expect(hashOtpCode('123456')).toBe(createHash('sha256').update('123456').digest('hex'));
    expect(hashOtpCode('123456')).toHaveLength(64);
    expect(hashOtpCode('123456')).not.toBe('123456');
  });

  it('normalizes whitespace before hashing', () => {
    expect(hashOtpCode(' 123456 ')).toBe(hashOtpCode('123456'));
  });
});
