import { buildMobileAppVersionResponse } from './app-version';

describe('buildMobileAppVersionResponse', () => {
  const now = new Date('2026-08-15T10:00:00.000Z');

  it('uses defaults when env is empty', () => {
    const payload = buildMobileAppVersionResponse({}, now);
    expect(payload.generatedAt).toBe('2026-08-15T10:00:00.000Z');
    expect(payload.passenger.currentVersion).toBe('1.0.10');
    expect(payload.driver.currentVersion).toBe('1.0.10');
    expect(payload.passenger.minVersion).toBe('1.0.0');
    expect(payload.passenger.currentVersionCode).toBe(88);
    expect(payload.driver.currentVersionCode).toBe(88);
    expect(payload.passenger.minVersionCode).toBe(0);
    expect(payload.passenger.storeUrl).toContain('cd.mova.mova.passenger');
    expect(payload.driver.storeUrl).toContain('cd.mova.mova.driver');
  });

  it('reads MOBILE_* and Play Store env vars', () => {
    const payload = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION: '1.0.10',
        MOBILE_DRIVER_VERSION: '1.0.11',
        MOBILE_MIN_VERSION: '1.0.1',
        MOBILE_PASSENGER_VERSION_CODE: '68',
        MOBILE_DRIVER_VERSION_CODE: '69',
        MOBILE_MIN_VERSION_CODE: '8',
        PLAY_STORE_PASSENGER_URL: 'https://play.example/passenger',
        PLAY_STORE_DRIVER_URL: 'https://play.example/driver',
      },
      now,
    );
    expect(payload.passenger.currentVersion).toBe('1.0.10');
    expect(payload.driver.currentVersion).toBe('1.0.11');
    expect(payload.passenger.minVersion).toBe('1.0.1');
    expect(payload.driver.minVersion).toBe('1.0.1');
    expect(payload.passenger.currentVersionCode).toBe(88);
    expect(payload.driver.currentVersionCode).toBe(88);
    expect(payload.passenger.minVersionCode).toBe(8);
    expect(payload.passenger.storeUrl).toBe('https://play.example/passenger');
    expect(payload.driver.storeUrl).toBe('https://play.example/driver');
  });

  it('never advertises currentVersionCode 0', () => {
    const payload = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION_CODE: '0',
        MOBILE_DRIVER_VERSION_CODE: '0',
      },
      now,
    );
    expect(payload.passenger.currentVersionCode).toBe(88);
    expect(payload.driver.currentVersionCode).toBe(88);
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
    expect(payload.passenger.currentVersion).toBe('1.0.10');
    expect(payload.driver.currentVersion).toBe('1.0.10');
    expect(payload.passenger.currentVersionCode).toBe(88);
    expect(payload.driver.currentVersionCode).toBe(88);
  });

  it('raises a stale env below Play floor 88', () => {
    for (const code of ['71', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '85', '86', '87']) {
      const payload = buildMobileAppVersionResponse(
        {
          MOBILE_PASSENGER_VERSION_CODE: code,
          MOBILE_DRIVER_VERSION_CODE: code,
        },
        now,
      );
      expect(payload.passenger.currentVersionCode).toBe(88);
      expect(payload.driver.currentVersionCode).toBe(88);
    }
  });

  it('keeps env above the floor', () => {
    const payload = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION_CODE: '88',
        MOBILE_DRIVER_VERSION_CODE: '89',
      },
      now,
    );
    expect(payload.passenger.currentVersionCode).toBe(88);
    expect(payload.driver.currentVersionCode).toBe(89);
  });
});
