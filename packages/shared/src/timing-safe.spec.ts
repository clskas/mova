import { timingSafeEqualString } from './timing-safe';

describe('timingSafeEqualString', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqualString('secret', 'secret')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeEqualString('secret', 'secreT')).toBe(false);
  });

  it('returns false for different lengths without throwing', () => {
    expect(() => timingSafeEqualString('ab', 'abcd')).not.toThrow();
    expect(timingSafeEqualString('ab', 'abcd')).toBe(false);
    expect(timingSafeEqualString('', 'x')).toBe(false);
  });

  it('treats null and undefined as empty', () => {
    expect(timingSafeEqualString(undefined, '')).toBe(true);
    expect(timingSafeEqualString(null, '')).toBe(true);
    expect(timingSafeEqualString(null, 'x')).toBe(false);
  });
});
