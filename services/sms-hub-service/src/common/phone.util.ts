import { BadRequestException } from '@nestjs/common';

/** Normalize to `243XXXXXXXXX` (no +). */
export function normalizePhoneCd(raw: string): string {
  let p = String(raw || '').trim().replace(/[\s()-]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0') && p.length === 10) p = `243${p.slice(1)}`;
  if (!/^243\d{9}$/.test(p)) {
    throw new BadRequestException({
      message: 'Invalid phone (expect 243XXXXXXXXX or +243…)',
      code: 'PHONE_INVALID',
    });
  }
  return p;
}
