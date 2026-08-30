import { matchesInternalApiKey } from './internal-api.guard';

describe('matchesInternalApiKey', () => {
  const key = 'mova-internal-dev-key-24chars';

  it('accepts the exact key', () => {
    expect(matchesInternalApiKey(key, key)).toBe(true);
  });

  it('rejects a different key of the same length', () => {
    expect(matchesInternalApiKey('xxxx-internal-dev-key-24chars', key)).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(matchesInternalApiKey('short', key)).toBe(false);
    expect(matchesInternalApiKey(undefined, key)).toBe(false);
    expect(matchesInternalApiKey(['a', 'b'], key)).toBe(false);
  });
});
