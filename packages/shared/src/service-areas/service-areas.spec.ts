import { DRC_SERVICE_AREAS, findServiceAreaByCoords, isInServiceArea } from './index';

describe('service-areas', () => {
  it('includes Kinshasa and 26+ provincial cities', () => {
    expect(DRC_SERVICE_AREAS.length).toBeGreaterThanOrEqual(26);
    expect(DRC_SERVICE_AREAS.some((a) => a.id === 'kinshasa')).toBe(true);
    expect(DRC_SERVICE_AREAS.some((a) => a.id === 'lubumbashi')).toBe(true);
  });

  it('detects Kinshasa coords', () => {
    expect(isInServiceArea(-4.3217, 15.3125)).toBe(true);
    expect(findServiceAreaByCoords(-4.3217, 15.3125)?.name).toBe('Kinshasa');
  });

  it('detects Lubumbashi coords', () => {
    expect(isInServiceArea(-11.6647, 27.4794)).toBe(true);
    expect(findServiceAreaByCoords(-11.6647, 27.4794)?.name).toBe('Lubumbashi');
  });

  it('assigne le fuseau horaire par ville', async () => {
    const { resolveCityTimezone, DRC_TIMEZONE_EAST, DRC_TIMEZONE_WEST } = await import('./index');
    expect(resolveCityTimezone('Kinshasa')).toBe(DRC_TIMEZONE_WEST);
    expect(resolveCityTimezone('Matadi')).toBe(DRC_TIMEZONE_WEST);
    expect(resolveCityTimezone('Lubumbashi')).toBe(DRC_TIMEZONE_EAST);
    expect(resolveCityTimezone('Goma')).toBe(DRC_TIMEZONE_EAST);
    expect(resolveCityTimezone('Kisangani')).toBe(DRC_TIMEZONE_EAST);
  });

  it('accepts coords anywhere in DRC territory', () => {
    expect(isInServiceArea(0.495, 29.473)).toBe(true);
    expect(isInServiceArea(-3.0, 24.0)).toBe(true);
  });

  it('rejects coords outside DRC territory', () => {
    expect(isInServiceArea(48.8566, 2.3522)).toBe(false);
  });
});
