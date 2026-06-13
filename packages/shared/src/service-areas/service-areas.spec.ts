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

  it('rejects coords outside DRC service areas', () => {
    expect(isInServiceArea(48.8566, 2.3522)).toBe(false);
  });
});
