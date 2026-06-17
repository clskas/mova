import { isInDrcTerritory } from './rdc-territory';

describe('rdc-territory', () => {
  it('accepts Beni coords', () => {
    expect(isInDrcTerritory(0.495, 29.473)).toBe(true);
  });

  it('accepts Kinshasa coords', () => {
    expect(isInDrcTerritory(-4.32, 15.31)).toBe(true);
  });

  it('rejects Paris coords', () => {
    expect(isInDrcTerritory(48.8566, 2.3522)).toBe(false);
  });
});
