import { buildMobileAppVersionResponse } from './app-version';

describe('buildMobileAppVersionResponse', () => {
  const now = new Date('2026-08-15T10:00:00.000Z');

  it('uses defaults when env is empty', () => {
    const payload = buildMobileAppVersionResponse({}, now);
    expect(payload.generatedAt).toBe('2026-08-15T10:00:00.000Z');
    expect(payload.passenger.currentVersion).toBe('1.0.2');
    expect(payload.driver.currentVersion).toBe('1.0.2');
    expect(payload.passenger.minVersion).toBe('1.0.0');
    expect(payload.passenger.storeUrl).toContain('cd.mova.mova.passenger');
    expect(payload.driver.storeUrl).toContain('cd.mova.mova.driver');
  });

  it('reads MOBILE_* and Play Store env vars', () => {
    const payload = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION: '1.0.5',
        MOBILE_DRIVER_VERSION: '1.0.6',
        MOBILE_MIN_VERSION: '1.0.1',
        PLAY_STORE_PASSENGER_URL: 'https://play.example/passenger',
        PLAY_STORE_DRIVER_URL: 'https://play.example/driver',
      },
      now,
    );
    expect(payload.passenger.currentVersion).toBe('1.0.5');
    expect(payload.driver.currentVersion).toBe('1.0.6');
    expect(payload.passenger.minVersion).toBe('1.0.1');
    expect(payload.driver.minVersion).toBe('1.0.1');
    expect(payload.passenger.storeUrl).toBe('https://play.example/passenger');
    expect(payload.driver.storeUrl).toBe('https://play.example/driver');
  });
});
