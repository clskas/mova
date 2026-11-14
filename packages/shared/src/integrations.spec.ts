import { EXTERNAL_PLATFORMS, integrationEnvPresence, platformStatus } from './integrations';

describe('external platforms', () => {
  const byKey = (k: string) => EXTERNAL_PLATFORMS.find((p) => p.key === k)!;

  it('reports presence only, never values', () => {
    const out = integrationEnvPresence(['MAPBOX_ACCESS_TOKEN', 'SENTRY_DSN'], { MAPBOX_ACCESS_TOKEN: 'secret-value' } as NodeJS.ProcessEnv);
    expect(out).toEqual({ MAPBOX_ACCESS_TOKEN: true, SENTRY_DSN: false });
    expect(JSON.stringify(out)).not.toContain('secret-value');
  });

  it('status from the merged presence', () => {
    expect(platformStatus(byKey('render'), {})).toBe('external');
    expect(platformStatus(byKey('mapbox'), {})).toBe('missing');
    expect(platformStatus(byKey('mapbox'), { MAPBOX_ACCESS_TOKEN: true })).toBe('configured');
    expect(platformStatus(byKey('twilio'), {})).toBe('unused');
    expect(platformStatus(byKey('supabase'), { SUPABASE_URL: true })).toBe('partial');
  });

  it('every platform has a console link and a use', () => {
    for (const p of EXTERNAL_PLATFORMS) {
      expect(p.consoleUrl).toMatch(/^https:\/\//);
      expect(p.usedFor.length).toBeGreaterThan(10);
    }
  });
});
