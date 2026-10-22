import { collectAppleAudiences, appleAudienceAllowed, PRODUCTION_APPLE_CLIENT_IDS } from './apple-id-token';

describe('collectAppleAudiences', () => {
  it('includes production bundle IDs', () => {
    const ids = collectAppleAudiences({});
    expect(ids).toEqual(expect.arrayContaining([...PRODUCTION_APPLE_CLIENT_IDS]));
  });

  it('merges env extras', () => {
    const ids = collectAppleAudiences({
      APPLE_CLIENT_ID: 'com.example.extra',
    });
    expect(ids).toContain('com.example.extra');
    expect(ids).toContain('cd.mova.mova');
  });
});

describe('appleAudienceAllowed', () => {
  it('matches bundle id', () => {
    expect(appleAudienceAllowed('cd.mova.mova', ['cd.mova.mova', 'cd.mova.mova.driver'])).toBe(
      true,
    );
    expect(appleAudienceAllowed('other', ['cd.mova.mova'])).toBe(false);
  });
});
