import { isAllowedLoadTest } from './gateway-throttler.guard';

const KEY = 'k'.repeat(32);

describe('isAllowedLoadTest (staging load test bypass)', () => {
  it('accepts the right key on staging', () => {
    expect(isAllowedLoadTest(KEY, { APP_ENV: 'staging', LOAD_TEST_KEY: KEY })).toBe(true);
  });
  it('never in production, even with the key', () => {
    expect(isAllowedLoadTest(KEY, { APP_ENV: 'production', LOAD_TEST_KEY: KEY })).toBe(false);
    expect(isAllowedLoadTest(KEY, { NODE_ENV: 'production', LOAD_TEST_KEY: KEY })).toBe(false);
  });
  it('refuses a wrong, missing or short key', () => {
    expect(isAllowedLoadTest('x'.repeat(32), { APP_ENV: 'staging', LOAD_TEST_KEY: KEY })).toBe(false);
    expect(isAllowedLoadTest(undefined, { APP_ENV: 'staging', LOAD_TEST_KEY: KEY })).toBe(false);
    expect(isAllowedLoadTest('short', { APP_ENV: 'staging', LOAD_TEST_KEY: 'short' })).toBe(false);
    expect(isAllowedLoadTest(KEY, { APP_ENV: 'staging' })).toBe(false);
  });
});
