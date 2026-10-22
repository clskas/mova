import {
  buildMobileAppVersionResponse,
  loadMobileStoreVersion,
} from './app-version';

describe('buildMobileAppVersionResponse', () => {
  const now = new Date('2026-08-15T10:00:00.000Z');
  /** Fixture at/above BUILTIN_FLOOR — store arg is still raised by the builtin safety net. */
  const store = { version: '1.0.34', versionCode: 176 };

  it('uses the committed store file as floor when env is empty', () => {
    const payload = buildMobileAppVersionResponse({}, now, store);
    expect(payload.generatedAt).toBe('2026-08-15T10:00:00.000Z');
    expect(payload.passenger.currentVersion).toBe('1.0.34');
    expect(payload.driver.currentVersion).toBe('1.0.34');
    expect(payload.passenger.currentVersionCode).toBe(176);
    expect(payload.driver.currentVersionCode).toBe(176);
    expect(payload.passenger.minVersion).toBe('1.0.0');
    expect(payload.passenger.storeUrl).toContain('cd.mova.mova.passenger');
    expect(payload.driver.storeUrl).toContain('cd.mova.mova.driver');
  });

  it('lets env raise above the store file but never fall below', () => {
    const raised = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION: '1.0.35',
        MOBILE_DRIVER_VERSION: '1.0.35',
        MOBILE_PASSENGER_VERSION_CODE: '180',
        MOBILE_DRIVER_VERSION_CODE: '180',
      },
      now,
      store,
    );
    expect(raised.passenger.currentVersion).toBe('1.0.35');
    expect(raised.passenger.currentVersionCode).toBe(180);

    const stale = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION: '1.0.27',
        MOBILE_DRIVER_VERSION: '1.0.27',
        MOBILE_PASSENGER_VERSION_CODE: '139',
        MOBILE_DRIVER_VERSION_CODE: '139',
      },
      now,
      store,
    );
    expect(stale.passenger.currentVersion).toBe('1.0.34');
    expect(stale.driver.currentVersion).toBe('1.0.34');
    expect(stale.passenger.currentVersionCode).toBe(176);
    expect(stale.driver.currentVersionCode).toBe(176);
  });

  it('ignores blueprint-stale env below a newer store file', () => {
    const payload = buildMobileAppVersionResponse(
      {
        MOBILE_PASSENGER_VERSION_CODE: '139',
        MOBILE_DRIVER_VERSION_CODE: '139',
      },
      now,
      { version: '1.0.34', versionCode: 176 },
    );
    expect(payload.passenger.currentVersionCode).toBe(176);
    expect(payload.driver.currentVersionCode).toBe(176);
  });

  it('raises a store fixture below the builtin safety floor', () => {
    const payload = buildMobileAppVersionResponse(
      {},
      now,
      { version: '1.0.32', versionCode: 157 },
    );
    expect(payload.passenger.currentVersion).toBe('1.0.34');
    expect(payload.passenger.currentVersionCode).toBe(174);
  });

  it('loadMobileStoreVersion falls back when file is missing', () => {
    const loaded = loadMobileStoreVersion(() => {
      throw new Error('missing');
    }, '/no/such/dir');
    expect(loaded.version).toBe('1.0.34');
    expect(loaded.versionCode).toBe(174);
  });
});
