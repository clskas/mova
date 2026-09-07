import { isDemoCatalogSeedEnabled } from './seed.service';

describe('isDemoCatalogSeedEnabled', () => {
  it('is false by default, including production', () => {
    expect(isDemoCatalogSeedEnabled({})).toBe(false);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'production', SEED_DEMO_CATALOG: 'false' })).toBe(false);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('never runs in production, even if SEED_DEMO_CATALOG=true', () => {
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'production', SEED_DEMO_CATALOG: 'true' })).toBe(false);
  });

  it('runs only when SEED_DEMO_CATALOG=true AND local RUN_SEED=true', () => {
    expect(isDemoCatalogSeedEnabled({ SEED_DEMO_CATALOG: 'true' })).toBe(false);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'development', SEED_DEMO_CATALOG: 'true' })).toBe(false);
    expect(
      isDemoCatalogSeedEnabled({
        APP_ENV: 'development',
        RUN_SEED: 'true',
        SEED_DEMO_CATALOG: 'true',
      }),
    ).toBe(true);
  });

  it('never runs on Render even with RUN_SEED=true', () => {
    expect(
      isDemoCatalogSeedEnabled({
        APP_ENV: 'development',
        RUN_SEED: 'true',
        SEED_DEMO_CATALOG: 'true',
        RENDER: 'true',
      }),
    ).toBe(false);
  });

  it('respects SKIP_DEMO_SEED', () => {
    expect(isDemoCatalogSeedEnabled({ SEED_DEMO_CATALOG: 'true', SKIP_DEMO_SEED: 'true' })).toBe(false);
  });

  it('respects RUN_SEED=false', () => {
    expect(isDemoCatalogSeedEnabled({ SEED_DEMO_CATALOG: 'true', RUN_SEED: 'false' })).toBe(false);
  });
});
