import {
  callbackClientIp,
  parseAllowedIps,
  UNKNOWN_REF_LIMIT,
  UNKNOWN_REF_WINDOW_MS,
  UnsignedCallbackShield,
} from './unsigned-callback-shield';

describe('UnsignedCallbackShield', () => {
  it('uses the last X-Forwarded-For entry (the one Caddy adds), not a forged first one', () => {
    expect(callbackClientIp({ 'x-forwarded-for': '1.2.3.4, 41.243.10.5' })).toBe('41.243.10.5');
    expect(callbackClientIp({}, '::ffff:41.243.10.6')).toBe('41.243.10.6');
  });

  it('accepts only listed addresses when SERDIPAY_CALLBACK_IPS is set', () => {
    const shield = new UnsignedCallbackShield();
    const allowed = parseAllowedIps(' 41.243.10.5 , 41.243.10.6');
    expect(shield.refusal('41.243.10.5', allowed)).toBeNull();
    expect(shield.refusal('8.8.8.8', allowed)).toBe('not_allowed');
    expect(shield.refusal('8.8.8.8', parseAllowedIps(''))).toBeNull();
  });

  it('stops listening to an address that guesses transaction ids, then forgives it', () => {
    const shield = new UnsignedCallbackShield();
    const none = new Set<string>();
    const t0 = 1_000_000;
    for (let i = 0; i < UNKNOWN_REF_LIMIT - 1; i += 1) shield.recordUnknown('6.6.6.6', t0);
    expect(shield.refusal('6.6.6.6', none, t0)).toBeNull();
    shield.recordUnknown('6.6.6.6', t0);
    expect(shield.refusal('6.6.6.6', none, t0)).toBe('guessing');
    expect(shield.refusal('41.243.10.5', none, t0)).toBeNull();
    expect(shield.refusal('6.6.6.6', none, t0 + UNKNOWN_REF_WINDOW_MS + 1)).toBeNull();
  });
});
