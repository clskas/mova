import { isValidLocalPin, hashLocalPin, verifyLocalPin } from './local-pin.util';

describe('local-pin.util', () => {
  it('rejects weak pins', () => {
    expect(isValidLocalPin('123456')).toBe(false);
    expect(isValidLocalPin('000000')).toBe(false);
    expect(isValidLocalPin('12345')).toBe(false);
  });

  it('accepts and verifies a strong pin', () => {
    const pin = '847291';
    expect(isValidLocalPin(pin)).toBe(true);
    const stored = hashLocalPin(pin);
    expect(verifyLocalPin(pin, stored)).toBe(true);
    expect(verifyLocalPin('111111', stored)).toBe(false);
  });
});
