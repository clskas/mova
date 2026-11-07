import { RideStatus, VehicleType } from './enums';
import {
  buildFareBreakdown,
  driverEligibleForMoving,
  driverVehicleTypesForRide,
  driverVehicleTypesForSearch,
  driverEligibleForParcelWeight,
  fromMobileRideStatus,
  normalizeVehicleType,
  rideTypesDriverCanServe,
  vehicleCategory,
  toMobileRideStatus,
  toMobileVehicleType,
} from './ride-contract';

describe('ride-contract', () => {
  it('normalizes mobile vehicle aliases', () => {
    expect(normalizeVehicleType('MOTO')).toBe('MOTO_TAXI');
    expect(normalizeVehicleType('moto-taxi')).toBe('MOTO_TAXI');
    expect(normalizeVehicleType('BIKE')).toBe('MOTO_TAXI');
    expect(normalizeVehicleType('TAXI')).toBe('STANDARD');
    expect(normalizeVehicleType('BERLINE')).toBe('STANDARD');
    expect(normalizeVehicleType('CONFORT')).toBe('COMFORT');
    expect(normalizeVehicleType('VIP')).toBe('VIP');
    expect(vehicleCategory('MOTO')).toBe('MOTO');
    expect(vehicleCategory('TAXI')).toBe('TAXI');
    expect(vehicleCategory('CONFORT')).toBe('TAXI');
  });

  it('maps ride statuses for mobile', () => {
    expect(toMobileRideStatus('SEARCHING')).toBe('MATCHING');
    expect(toMobileRideStatus('ACCEPTED')).toBe('DRIVER_ASSIGNED');
    expect(fromMobileRideStatus('ARRIVING')).toBe('DRIVER_ARRIVED');
  });

  it('maps vehicle types for mobile', () => {
    expect(toMobileVehicleType('MOTO_TAXI')).toBe('MOTO');
    expect(toMobileVehicleType('COMFORT')).toBe('CONFORT');
    expect(toMobileVehicleType('VIP')).toBe('VIP');
    expect(toMobileVehicleType('FAMILIALE')).toBe('FAMILIALE');
  });

  it('normalizes Familiale aliases', () => {
    for (const a of ['FAMILIALE', 'familiale', 'XL', 'van', 'Minivan', 'FAMILY']) {
      expect(normalizeVehicleType(a)).toBe('FAMILIALE');
    }
  });

  it('matches driver tiers to ride types (exact category only)', () => {
    expect(rideTypesDriverCanServe(['STANDARD'])).toEqual(['STANDARD']);
    expect(rideTypesDriverCanServe(['COMFORT'])).toEqual(['COMFORT']);
    expect(rideTypesDriverCanServe(['VIP'])).toEqual(['VIP']);
    expect(rideTypesDriverCanServe(['COMFORT', 'VIP']).sort()).toEqual(['COMFORT', 'VIP'].sort());
    expect(driverVehicleTypesForRide('COMFORT')).toEqual(['COMFORT']);
    // A Familiale vehicle may also take a Standard ride (UberXL → UberX).
    expect(driverVehicleTypesForRide('STANDARD')).toEqual(['STANDARD', 'FAMILIALE']);
    expect(driverVehicleTypesForRide('FAMILIALE')).toEqual(['FAMILIALE']);
    expect(rideTypesDriverCanServe(['FAMILIALE']).sort()).toEqual(['FAMILIALE', 'STANDARD']);
    expect(driverVehicleTypesForRide('VIP')).toEqual(['VIP']);
    expect(driverVehicleTypesForRide('MOTO')).toEqual(['MOTO_TAXI']);
    expect(driverVehicleTypesForRide('TAXI')).toEqual(['STANDARD', 'FAMILIALE']);
    expect(driverVehicleTypesForRide('UNKNOWN')).toEqual([]);
  });

  it('builds fare breakdown with surcharge', () => {
    const fare = buildFareBreakdown('STANDARD', 5, 12, 3000, 7500, 2400, 1.0, 5000);
    expect(fare.baseFareCdf).toBe(3000);
    expect(fare.distanceFareCdf).toBe(7500);
    expect(fare.durationFareCdf).toBe(2400);
    expect(fare.totalCdf).toBe(12900);
    expect(fare.estimatedFareCdf).toBe(12900);
    expect(fare.currency).toBe('CDF');
  });
});

describe('driverEligibleForMoving', () => {
  it('refuses passenger cars and motos for every moving vehicle', () => {
    for (const category of ['CAMIONNETTE', 'CAMION_15M3', 'CAMION_30M3', 'CAMION_50M3']) {
      for (const type of ['MOTO_TAXI', 'STANDARD', 'COMFORT', 'VIP', 'FAMILIALE'] as const) {
        expect(driverEligibleForMoving([type], category)).toBe(false);
      }
    }
  });

  it('accepts a utilitaire up to the 15 m³ truck only', () => {
    expect(driverEligibleForMoving(['UTILITAIRE'], 'CAMIONNETTE')).toBe(true);
    expect(driverEligibleForMoving(['UTILITAIRE'], 'CAMION_15M3')).toBe(true);
    expect(driverEligibleForMoving(['UTILITAIRE'], 'CAMION_30M3')).toBe(false);
    expect(driverEligibleForMoving(['UTILITAIRE'], 'CAMION_50M3')).toBe(false);
  });

  it('accepts a camion for every moving vehicle', () => {
    for (const category of ['CAMIONNETTE', 'CAMION_15M3', 'CAMION_30M3', 'CAMION_50M3']) {
      expect(driverEligibleForMoving(['CAMION'], category)).toBe(true);
    }
  });

  it('accepts a driver when one of their vehicles fits', () => {
    expect(driverEligibleForMoving(['STANDARD', 'CAMION'], 'CAMION_50M3')).toBe(true);
  });
});

describe('tricycle and tripoteur', () => {
  it('normalizes the local names', () => {
    expect(normalizeVehicleType('keke')).toBe('TRICYCLE');
    expect(normalizeVehicleType('tuk-tuk')).toBe('TRICYCLE');
    expect(normalizeVehicleType('Tripoteur')).toBe('TRIPOTEUR');
  });

  it('sends Tricycle rides to tricycles only, never to tripoteurs', () => {
    expect(driverVehicleTypesForRide('TRICYCLE')).toEqual(['TRICYCLE']);
    expect(driverVehicleTypesForRide('STANDARD')).not.toContain('TRICYCLE');
  });

  it('lets a tripoteur take a camionnette move but not a truck move', () => {
    expect(driverEligibleForMoving(['TRIPOTEUR'], 'CAMIONNETTE')).toBe(true);
    expect(driverEligibleForMoving(['TRIPOTEUR'], 'CAMION_15M3')).toBe(false);
    expect(driverEligibleForMoving(['TRICYCLE'], 'CAMIONNETTE')).toBe(false);
  });
});

describe('driverVehicleTypesForSearch', () => {
  it('finds goods vehicles for parcels and moves', () => {
    expect(driverVehicleTypesForSearch('TRIPOTEUR')).toEqual(['TRIPOTEUR']);
    expect(driverVehicleTypesForSearch('UTILITAIRE')).toEqual(['UTILITAIRE']);
    expect(driverVehicleTypesForSearch('CAMION')).toEqual(['CAMION']);
  });
  it('keeps the passenger ride rules', () => {
    expect(driverVehicleTypesForSearch('STANDARD')).toEqual(['STANDARD', 'FAMILIALE']);
    expect(driverVehicleTypesForSearch('TRICYCLE')).toEqual(['TRICYCLE']);
    expect(driverVehicleTypesForSearch('???')).toEqual([]);
  });
  it('a tripoteur can take a large parcel', () => {
    expect(driverEligibleForParcelWeight(['TRIPOTEUR'], 'LARGE')).toBe(true);
  });
});
