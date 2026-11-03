import { applyIosLiveVersions, buildMobileAppVersionResponse, resolveClientPlatform } from './app-version';
import { IosStoreVersionService, parseItunesLookupVersion } from './ios-store-version';

describe('iOS live App Store versions', () => {
  const store = { version: '1.0.42', versionCode: 207 };
  const base = () => buildMobileAppVersionResponse({}, new Date('2026-11-03T00:00:00Z'), store);

  it('advertises the live App Store version to iOS, not the freshly uploaded build', () => {
    const res = applyIosLiveVersions(base(), { passenger: '1.0.33', driver: null });
    expect(res.passenger).toMatchObject({
      currentVersion: '1.0.33',
      currentVersionCode: 0,
      storeUrl: 'https://apps.apple.com/app/id6818768971',
    });
    // Driver not live on the App Store → no banner.
    expect(res.driver).toMatchObject({ currentVersion: '0.0.0', currentVersionCode: 0 });
  });

  it('never forces iPhones to a minimum the App Store does not serve', () => {
    const res = applyIosLiveVersions(
      buildMobileAppVersionResponse(
        { MOBILE_MIN_VERSION: '1.0.40', MOBILE_MIN_VERSION_CODE: '200' },
        new Date(),
        store,
      ),
      { passenger: '1.0.33', driver: '1.0.41' },
    );
    expect(res.passenger).toMatchObject({ minVersion: '1.0.33', minVersionCode: 0 });
    expect(res.driver).toMatchObject({ minVersion: '1.0.40', minVersionCode: 0 });
  });

  it('keeps Android / legacy clients on the store file', () => {
    expect(base().passenger).toMatchObject({ currentVersion: '1.0.42', currentVersionCode: 207 });
  });

  it('resolves the platform from header or query', () => {
    expect(resolveClientPlatform('iOS')).toBe('ios');
    expect(resolveClientPlatform(undefined, 'android')).toBe('android');
    expect(resolveClientPlatform(['ios'])).toBe('ios');
    expect(resolveClientPlatform()).toBe('unknown');
  });

  it('parses iTunes lookup payloads', () => {
    expect(parseItunesLookupVersion({ resultCount: 1, results: [{ version: '1.0.33' }] })).toBe('1.0.33');
    expect(parseItunesLookupVersion({ resultCount: 0, results: [] })).toBeNull();
    expect(parseItunesLookupVersion(null)).toBeNull();
  });

  it('caches lookups and keeps the last good value when Apple is unreachable', async () => {
    const ok = (version: string) =>
      Promise.resolve({ ok: true, json: async () => ({ results: [{ version }] }) } as Response);
    const fetchFn = jest.fn().mockImplementation(() => ok('1.0.33'));
    const svc = new IosStoreVersionService(fetchFn as never, {});
    await expect(svc.get(0)).resolves.toEqual({ passenger: '1.0.33', driver: '1.0.33' });
    await svc.get(60_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    fetchFn.mockImplementation(() => Promise.reject(new Error('offline')));
    await expect(svc.get(16 * 60_000)).resolves.toEqual({ passenger: '1.0.33', driver: '1.0.33' });
  });
});
