import { receiptVerdict } from './ai-vision.util';

describe('receiptVerdict', () => {
  const ok = { isReceipt: true, readable: true, totalCdf: 25000 };

  it('accepts a receipt close to the declared amount and within budget', () => {
    expect(receiptVerdict(ok, 25500, 30000).verdict).toBe('OK');
  });

  it('flags a gap with the declared amount or a total over budget', () => {
    expect(receiptVerdict(ok, 20000, 30000).verdict).toBe('ECART');
    expect(receiptVerdict(ok, 25000, 20000).verdict).toBe('ECART');
  });

  it('asks to check an unreadable receipt or a total not in CDF', () => {
    expect(receiptVerdict(null, 1000, 2000).verdict).toBe('A_VERIFIER');
    expect(receiptVerdict({ isReceipt: true, readable: true, totalCdf: null }, 1000, 2000).verdict).toBe('A_VERIFIER');
  });
});
