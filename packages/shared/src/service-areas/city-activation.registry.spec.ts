import {
  clearCityActivationOverrides,
  findGeographicServiceAreaByCoords,
  findServiceAreaByCoords,
  isCityOperational,
  setCityActivationOverrides,
} from './index';

describe('city activation registry', () => {
  afterEach(() => {
    clearCityActivationOverrides();
  });

  it('désactive une ville via overrides DB', () => {
    setCityActivationOverrides([
      { slug: 'kinshasa', name: 'Kinshasa', isActive: false },
      { slug: 'lubumbashi', name: 'Lubumbashi', isActive: true },
    ]);
    expect(isCityOperational('kinshasa', 'Kinshasa')).toBe(false);
    expect(isCityOperational('lubumbashi', 'Lubumbashi')).toBe(true);
    expect(findServiceAreaByCoords(-4.3217, 15.3125)).toBeNull();
    expect(findGeographicServiceAreaByCoords(-4.3217, 15.3125)?.name).toBe('Kinshasa');
  });
});
