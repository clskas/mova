import {
  applySeatLimits,
  DEFAULT_SEAT_LIMITS,
  maxRidePassengerCount,
  normalizeDeclaredSeats,
  normalizeRidePassengerCount,
  normalizeSeatLimits,
  RIDE_PASSENGER_LIMIT_BY_TYPE,
} from './passenger-seats';
import { mergeClientAppsConfig } from './client-apps-config';

describe('admin seat limits', () => {
  afterEach(() => applySeatLimits(DEFAULT_SEAT_LIMITS));

  it('keeps today\'s limits by default', () => {
    expect(mergeClientAppsConfig({}).seatLimits).toEqual(DEFAULT_SEAT_LIMITS);
    expect(normalizeDeclaredSeats('TRICYCLE', 4)).toBeNull();
  });

  it('lets a tricycle carry more passengers once the admin raises the limit', () => {
    applySeatLimits({ ...DEFAULT_SEAT_LIMITS, tricycleMaxSeats: 5 });
    expect(normalizeDeclaredSeats('TRICYCLE', 5)).toBe(5);
    expect(normalizeDeclaredSeats('TRICYCLE', 6)).toBeNull();
    expect(RIDE_PASSENGER_LIMIT_BY_TYPE.TRICYCLE).toBe(5);
  });

  it('follows the Familiale range', () => {
    applySeatLimits({ carMaxPassengers: 4, familialeMinSeats: 6, familialeMaxSeats: 12, tricycleMaxSeats: 3 });
    expect(normalizeDeclaredSeats('FAMILIALE', 5)).toBeNull();
    expect(normalizeDeclaredSeats('FAMILIALE', 12)).toBe(12);
    expect(maxRidePassengerCount()).toBe(12);
    expect(normalizeRidePassengerCount('FAMILIALE', 15)).toBe(12);
  });

  it('rejects incoherent or out-of-range values', () => {
    const l = normalizeSeatLimits({ carMaxPassengers: 0, familialeMinSeats: 9, familialeMaxSeats: 7, tricycleMaxSeats: 'x' });
    expect(l.carMaxPassengers).toBe(1);
    expect(l.familialeMaxSeats).toBe(7);
    expect(l.familialeMinSeats).toBe(7);
    expect(l.tricycleMaxSeats).toBe(3);
  });
});
