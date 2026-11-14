import { makeReferralCode } from './referral.service';

describe('referral code', () => {
  it('is short, readable and starts with SG', () => {
    const code = makeReferralCode(123456789);
    expect(code).toMatch(/^SG[A-HJ-NP-Z2-9]{6}$/);
    expect(makeReferralCode(42)).not.toEqual(makeReferralCode(43));
  });
});
