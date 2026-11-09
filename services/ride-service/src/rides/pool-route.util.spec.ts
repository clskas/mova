import { lastPoolPosition, onboardDetourKm, orderPoolStops } from './pool-route.util';

const b = (id: string, status: string, pick: [number, number], drop: [number, number], extra: object = {}) => ({
  id,
  userId: `u-${id}`,
  status,
  pickupLat: pick[0],
  pickupLng: pick[1],
  pickupAddress: `P${id}`,
  dropoffLat: drop[0],
  dropoffLng: drop[1],
  dropoffAddress: `D${id}`,
  ...extra,
});

describe('pool route', () => {
  it('nearest stop first, a drop-off never before its pickup', () => {
    const start = { lat: 0, lng: 0 };
    // A: pickup close, drop-off far. B: pickup a bit further, drop-off close to B's pickup.
    const stops = orderPoolStops(start, [
      b('A', 'WAITING', [0, 0.01], [0, 0.2]),
      b('B', 'WAITING', [0, 0.03], [0, 0.04]),
    ]);
    expect(stops.map((s) => `${s.type}:${s.bookingId}`)).toEqual([
      'pickup:A',
      'pickup:B',
      'dropoff:B',
      'dropoff:A',
    ]);
  });

  it('on-board passengers only need their drop-off', () => {
    const stops = orderPoolStops({ lat: 0, lng: 0 }, [b('A', 'PICKED_UP', [0, 0], [0, 0.05]), b('C', 'DROPPED_OFF', [0, 0], [0, 0.01])]);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ type: 'dropoff', bookingId: 'A' });
  });

  it('driver position = the last stop done', () => {
    const pos = lastPoolPosition({ pickupLat: 9, pickupLng: 9 }, [
      b('A', 'PICKED_UP', [1, 1], [2, 2], { pickedUpAt: new Date('2026-01-01T10:00:00Z') }),
      b('B', 'DROPPED_OFF', [3, 3], [4, 4], { pickedUpAt: new Date('2026-01-01T09:00:00Z'), droppedOffAt: new Date('2026-01-01T11:00:00Z') }),
    ]);
    expect(pos).toEqual({ lat: 4, lng: 4 });
    expect(lastPoolPosition({ pickupLat: 9, pickupLng: 9 }, [])).toEqual({ lat: 9, lng: 9 });
  });

  it('a pickup on the way adds ~0 km, one behind adds a lot', () => {
    const pos = { lat: 0, lng: 0 };
    const drop = { lat: 0, lng: 0.1 };
    expect(onboardDetourKm(pos, { lat: 0, lng: 0.05 }, drop)).toBeLessThan(0.01);
    expect(onboardDetourKm(pos, { lat: 0, lng: -0.05 }, drop)).toBeGreaterThan(10);
  });
});
