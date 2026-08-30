import { isDemoCatalogSeedEnabled } from './seed.service';

describe('isDemoCatalogSeedEnabled', () => {
  it('is false by default, including production', () => {
    expect(isDemoCatalogSeedEnabled({})).toBe(false);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'production', SEED_DEMO_CATALOG: 'false' })).toBe(false);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('runs only when SEED_DEMO_CATALOG=true', () => {
    expect(isDemoCatalogSeedEnabled({ SEED_DEMO_CATALOG: 'true' })).toBe(true);
    expect(isDemoCatalogSeedEnabled({ NODE_ENV: 'production', SEED_DEMO_CATALOG: 'true' })).toBe(true);
  });
});
