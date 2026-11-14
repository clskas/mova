import { faceCheckedToday, selfieUploadPath } from './face-check.service';

describe('face check', () => {
  it('counts only a check made today (Kinshasa)', () => {
    const now = new Date('2026-11-14T10:00:00Z');
    expect(faceCheckedToday(new Date('2026-11-14T06:00:00Z'), now)).toBe(true);
    expect(faceCheckedToday(new Date('2026-11-13T21:00:00Z'), now)).toBe(false);
    expect(faceCheckedToday(null, now)).toBe(false);
  });

  it('accepts only selfies uploaded through SENGA', () => {
    expect(selfieUploadPath('/api/uploads/kyc/abc-123.jpg')).toBe('/api/uploads/kyc/abc-123.jpg');
    expect(selfieUploadPath('https://api.afri-soft.com/api/uploads/kyc/abc.jpg')).toBe('/api/uploads/kyc/abc.jpg');
    expect(selfieUploadPath('https://x1.supabase.co/storage/v1/object/sign/kyc-docs/kyc/abc.jpg?token=t')).toBe('/api/uploads/kyc/abc.jpg');
    expect(selfieUploadPath('http://169.254.169.254/latest')).toBeNull();
    expect(selfieUploadPath('/api/uploads/kyc/../../etc')).toBeNull();
  });
});
