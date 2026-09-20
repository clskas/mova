import { RideStatus, VehicleType } from './enums';
import {
  buildFareBreakdown,
  driverVehicleTypesForRide,
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
  });

  it('matches driver tiers to ride types (exact category only)', () => {
    expect(rideTypesDriverCanServe(['STANDARD'])).toEqual(['STANDARD']);
    expect(rideTypesDriverCanServe(['COMFORT'])).toEqual(['COMFORT']);
    expect(rideTypesDriverCanServe(['VIP'])).toEqual(['VIP']);
    expect(rideTypesDriverCanServe(['COMFORT', 'VIP']).sort()).toEqual(['COMFORT', 'VIP'].sort());
    expect(driverVehicleTypesForRide('COMFORT')).toEqual(['COMFORT']);
    expect(driverVehicleTypesForRide('STANDARD')).toEqual(['STANDARD']);
    expect(driverVehicleTypesForRide('VIP')).toEqual(['VIP']);
    expect(driverVehicleTypesForRide('MOTO')).toEqual(['MOTO_TAXI']);
    expect(driverVehicleTypesForRide('TAXI')).toEqual(['STANDARD']);
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
