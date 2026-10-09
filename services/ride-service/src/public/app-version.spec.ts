import { buildMobileAppVersionResponse } from './app-version';

describe('buildMobileAppVersionResponse', () => {
  const now = new Date('2026-08-15T10:00:00.000Z');

  it('uses defaults when env is empty', () => {
    const payload = buildMobileAppVersionResponse({}, now);
    expect(payload.generatedAt).toBe('2026-08-15T10:00:00.000Z');
    expect(payload.passenger.currentVersion).toBe('1.0.18');
    expect(payload.driver.currentVersion).toBe('1.0.18');
    expect(payload.passenger.minVersion).toBe('1.0.0');
    expect(payload.passenger.currentVersionCode).toBe(121);
    expect(payload.driver.currentVersionCode).toBe(121);
    expect(payload.passenger.minVersionCode).toBe(0);
    expect(payload.passenger.storeUrl).toContain('cd.mova.mova.passenger');
    expect(payload.driver.storeUrl).toContain('cd.mova.mova.driver');
  });

  it('reads MOBILE_* and Play Store env vars above the floor', () => {
    const payload = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION: '1.0.18',
        MOBILE_DRIVER_VERSION: '1.0.19',
        MOBILE_MIN_VERSION: '1.0.1',
        MOBILE_PASSENGER_VERSION_CODE: '121',
        MOBILE_DRIVER_VERSION_CODE: '122',
        MOBILE_MIN_VERSION_CODE: '8',
        PLAY_STORE_PASSENGER_URL: 'https://play.example/passenger',
        PLAY_STORE_DRIVER_URL: 'https://play.example/driver',
      },
      now,
    );
    expect(payload.passenger.currentVersion).toBe('1.0.18');
    expect(payload.driver.currentVersion).toBe('1.0.19');
    expect(payload.passenger.currentVersionCode).toBe(121);
    expect(payload.driver.currentVersionCode).toBe(122);
  });

  it('raises stale Render env below the shipped floor so banners can show', () => {
    const payload = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION: '1.0.4',
        MOBILE_DRIVER_VERSION: '1.0.4',
        MOBILE_PASSENGER_VERSION_CODE: '39',
        MOBILE_DRIVER_VERSION_CODE: '49',
      },
      now,
    );
    expect(payload.passenger.currentVersion).toBe('1.0.18');
    expect(payload.driver.currentVersion).toBe('1.0.18');
    expect(payload.passenger.currentVersionCode).toBe(121);
    expect(payload.driver.currentVersionCode).toBe(121);
  });

  it('raises a stale env below Play floor 121', () => {
    for (const code of ['102', '110', '115', '119', '120']) {
      const payload = buildMobileAppVersionResponse(
        {
          MOBILE_PASSENGER_VERSION_CODE: code,
          MOBILE_DRIVER_VERSION_CODE: code,
        },
        now,
      );
      expect(payload.passenger.currentVersionCode).toBe(121);
      expect(payload.driver.currentVersionCode).toBe(121);
    }
  });
});
