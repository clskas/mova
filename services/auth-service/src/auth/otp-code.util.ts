import { createHash } from 'crypto';

/** SHA-256 hex of a normalized OTP. Stored in `OtpCode.code` (String, no schema change). */
export function hashOtpCode(code: string): string {
  const digits = String(code ?? '').replace(/\s/g, '');
  return createHash('sha256').update(digits).digest('hex');
}
