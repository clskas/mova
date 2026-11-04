import {
  normalizeDeclaredSeats,
  normalizeRidePassengerCount,
  vehicleFitsPassengers,
  vehiclePassengerSeats,
} from './passenger-seats';
import { mergeClientAppsConfig, isPassengerCountEnabled } from './client-apps-config';

describe('passenger seats', () => {
  it('uses the category default when nothing is declared', () => {
    expect(vehiclePassengerSeats('STANDARD')).toBe(4);
    expect(vehiclePassengerSeats('MOTO_TAXI', null)).toBe(1);
    expect(vehiclePassengerSeats('CONFORT')).toBe(4);
  });

  it('uses the declared value, capped to the category maximum', () => {
    expect(vehiclePassengerSeats('STANDARD', 7)).toBe(7);
    expect(vehiclePassengerSeats('STANDARD', 3)).toBe(3);
    expect(vehiclePassengerSeats('MOTO_TAXI', 3)).toBe(1);
    expect(vehiclePassengerSeats('STANDARD', 50)).toBe(8);
  });

  it('validates driver declarations', () => {
    expect(normalizeDeclaredSeats('STANDARD', 6)).toBe(6);
    expect(normalizeDeclaredSeats('STANDARD', '5')).toBe(5);
    expect(normalizeDeclaredSeats('STANDARD', 0)).toBeNull();
    expect(normalizeDeclaredSeats('STANDARD', 9)).toBeNull();
    expect(normalizeDeclaredSeats('STANDARD', 2.5)).toBeNull();
    expect(normalizeDeclaredSeats('MOTO_TAXI', 2)).toBeNull();
    expect(normalizeDeclaredSeats('UNKNOWN', 4)).toBeNull();
  });

  it('normalizes the passenger count of a ride request', () => {
    expect(normalizeRidePassengerCount('STANDARD', undefined)).toBe(1);
    expect(normalizeRidePassengerCount('STANDARD', 3)).toBe(3);
    expect(normalizeRidePassengerCount('STANDARD', '2')).toBe(2);
    expect(normalizeRidePassengerCount('STANDARD', 0)).toBe(1);
    expect(normalizeRidePassengerCount('STANDARD', 40)).toBe(8);
    expect(normalizeRidePassengerCount('MOTO_TAXI', 3)).toBe(1);
    expect(normalizeRidePassengerCount('MOTO', 2)).toBe(1);
  });

  it('checks whether a vehicle fits the group', () => {
    expect(vehicleFitsPassengers({ type: 'STANDARD' }, 4)).toBe(true);
    expect(vehicleFitsPassengers({ type: 'STANDARD' }, 5)).toBe(false);
    expect(vehicleFitsPassengers({ type: 'STANDARD', passengerSeats: 7 }, 5)).toBe(true);
    expect(vehicleFitsPassengers({ type: 'STANDARD', passengerSeats: 3 }, 4)).toBe(false);
  });

  it('keeps the feature off unless enabled by admin', () => {
    expect(isPassengerCountEnabled(mergeClientAppsConfig({}))).toBe(false);
    expect(isPassengerCountEnabled(mergeClientAppsConfig({ features: { passengerCountEnabled: true } }))).toBe(true);
    expect(mergeClientAppsConfig({ features: { passengerCountEnabled: true } }).features.sengaPlusVisible).toBe(true);
  });
});
