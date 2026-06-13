import { RideStatus, VehicleType } from './enums';
import {
  buildFareBreakdown,
  fromMobileRideStatus,
  normalizeVehicleType,
  toMobileRideStatus,
  toMobileVehicleType,
} from './ride-contract';

describe('ride-contract', () => {
  it('normalizes mobile vehicle aliases', () => {
    expect(normalizeVehicleType('MOTO')).toBe('MOTO_TAXI');
    expect(normalizeVehicleType('CONFORT')).toBe('COMFORT');
    expect(normalizeVehicleType('VIP')).toBe('VIP');
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
