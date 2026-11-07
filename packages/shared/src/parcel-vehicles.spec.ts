import { driverFitsParcelVehicle, isParcelVehicleAllowed, parcelVehicleOptions, recommendedParcelVehicle } from './parcel-vehicles';

describe('parcel vehicles', () => {
  it('recommends the vehicle that fits the parcel', () => {
    expect(recommendedParcelVehicle('DOCUMENTS')).toBe('MOTO_TAXI');
    expect(recommendedParcelVehicle('SMALL')).toBe('MOTO_TAXI');
    expect(recommendedParcelVehicle('MEDIUM')).toBe('STANDARD');
    expect(recommendedParcelVehicle('LARGE')).toBe('TRIPOTEUR');
    expect(recommendedParcelVehicle('LARGE', 150)).toBe('UTILITAIRE');
    expect(recommendedParcelVehicle('LARGE', 500)).toBe('CAMION');
  });
  it('lets the customer pick another vehicle, never one too small', () => {
    expect(parcelVehicleOptions('LARGE').map((o) => o.vehicleType)).toEqual(['TRIPOTEUR', 'STANDARD', 'UTILITAIRE', 'CAMION']);
    expect(isParcelVehicleAllowed('MOTO_TAXI', 'LARGE')).toBe(false);
    expect(isParcelVehicleAllowed('STANDARD', 'SMALL')).toBe(true);
    expect(parcelVehicleOptions('MEDIUM').filter((o) => o.recommended)).toHaveLength(1);
  });
  it('a Familiale counts as a car for a parcel booked by car', () => {
    expect(driverFitsParcelVehicle(['FAMILIALE'], 'STANDARD')).toBe(true);
    expect(driverFitsParcelVehicle(['MOTO_TAXI'], 'TRIPOTEUR')).toBe(false);
    expect(driverFitsParcelVehicle(['TRIPOTEUR'], 'TRIPOTEUR')).toBe(true);
    expect(driverFitsParcelVehicle(['MOTO_TAXI'], null)).toBe(true);
  });
});
