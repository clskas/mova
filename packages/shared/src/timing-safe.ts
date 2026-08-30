import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string compare. Different lengths return false without throwing
 * (`crypto.timingSafeEqual` requires equal-length buffers).
 */
export function timingSafeEqualString(a?: string | null, b?: string | null): boolean {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
