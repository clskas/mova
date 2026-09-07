import { coerceCdfInteger } from './wallet.controller';

describe('coerceCdfInteger', () => {
  it('keeps whole CDF amounts and does not round 2300.6 to 2301', () => {
    expect(coerceCdfInteger(2300)).toBe(2300);
    expect(coerceCdfInteger('2300')).toBe(2300);
    expect(coerceCdfInteger('2 300')).toBe(2300);
    expect(coerceCdfInteger(2300.6)).toBe(2300.6);
    expect(coerceCdfInteger('')).toBe('');
  });
});
