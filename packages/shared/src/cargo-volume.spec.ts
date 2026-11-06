import { normalizeDeclaredCargoVolume, vehicleFitsMove, vehicleHasCargoVolume } from './cargo-volume';

describe('cargo volume', () => {
  it('exists only for utilitaire and camion', () => {
    expect(vehicleHasCargoVolume('UTILITAIRE')).toBe(true);
    expect(vehicleHasCargoVolume('CAMION')).toBe(true);
    expect(vehicleHasCargoVolume('STANDARD')).toBe(false);
  });

  it('validates the declared range', () => {
    expect(normalizeDeclaredCargoVolume('UTILITAIRE', 12)).toBe(12);
    expect(normalizeDeclaredCargoVolume('UTILITAIRE', 26)).toBeNull();
    expect(normalizeDeclaredCargoVolume('CAMION', 4)).toBeNull();
    expect(normalizeDeclaredCargoVolume('CAMION', '30')).toBe(30);
    expect(normalizeDeclaredCargoVolume('CAMION', 30.5)).toBeNull();
    expect(normalizeDeclaredCargoVolume('VIP', 10)).toBeNull();
  });
});

describe('vehicleFitsMove', () => {
  it('requires a suitable vehicle type', () => {
    expect(vehicleFitsMove({ type: 'VIP' }, 'CAMIONNETTE', 4)).toBe(false);
    expect(vehicleFitsMove({ type: 'UTILITAIRE', cargoVolumeM3: 20 }, 'CAMION_30M3', 20)).toBe(false);
    expect(vehicleFitsMove({ type: 'CAMION', cargoVolumeM3: 40, isActive: false }, 'CAMION_30M3', 20)).toBe(false);
  });

  it('requires the goods to fit when the volume is declared', () => {
    expect(vehicleFitsMove({ type: 'CAMION', cargoVolumeM3: 15 }, 'CAMION_30M3', 26)).toBe(false);
    expect(vehicleFitsMove({ type: 'CAMION', cargoVolumeM3: 30 }, 'CAMION_30M3', 26)).toBe(true);
    expect(vehicleFitsMove({ type: 'CAMION', cargoVolumeM3: 26 }, 'CAMION_30M3', 25.5)).toBe(true);
    expect(vehicleFitsMove({ type: 'CAMION', cargoVolumeM3: 25 }, 'CAMION_30M3', 25.5)).toBe(false);
  });

  it('accepts an undeclared volume (checked by the admin)', () => {
    expect(vehicleFitsMove({ type: 'CAMION', cargoVolumeM3: null }, 'CAMION_50M3', 45)).toBe(true);
  });

  it('checks only the type when no volume is given', () => {
    expect(vehicleFitsMove({ type: 'CAMION', cargoVolumeM3: 10 }, 'CAMION_50M3')).toBe(true);
  });
});

describe('tripoteur cargo volume', () => {
  it('accepts 1 to 4 m³', () => {
    expect(normalizeDeclaredCargoVolume('TRIPOTEUR', 3)).toBe(3);
    expect(normalizeDeclaredCargoVolume('TRIPOTEUR', 5)).toBeNull();
    expect(vehicleFitsMove({ type: 'TRIPOTEUR', cargoVolumeM3: 4 }, 'CAMIONNETTE', 4)).toBe(true);
    expect(vehicleFitsMove({ type: 'TRIPOTEUR', cargoVolumeM3: 2 }, 'CAMIONNETTE', 4)).toBe(false);
  });
});
