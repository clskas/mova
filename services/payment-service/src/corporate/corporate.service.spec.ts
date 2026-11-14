import { corporateCanPay, corporateWalletUserId } from './corporate.service';

describe('company accounts', () => {
  it('pays within the credit limit only', () => {
    expect(corporateCanPay(0, 400_000, 500_000)).toBe(true);
    expect(corporateCanPay(-450_000, 60_000, 500_000)).toBe(false);
    expect(corporateCanPay(20_000, 10_000, 0)).toBe(true);
    expect(corporateCanPay(0, 10_000, 0)).toBe(false);
  });

  it('has its own wallet', () => {
    expect(corporateWalletUserId('abc')).toBe('corp:abc');
  });
});
