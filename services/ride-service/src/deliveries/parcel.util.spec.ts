import { DeliveryStatus, DeliveryType } from '@prisma/client';
import {
  buildParcelTimeline,
  computeDeliveryEtaMinutes,
  generateDeliveryPin,
  mockCourierLocation,
  resolveCourierLocation,
} from './parcel.util';

describe('parcel.util', () => {
  it('generateDeliveryPin returns 4-digit string', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateDeliveryPin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(Number(pin)).toBeGreaterThanOrEqual(1000);
      expect(Number(pin)).toBeLessThanOrEqual(9999);
    }
  });

  it('computeDeliveryEtaMinutes uses haversine distance', () => {
    const eta = computeDeliveryEtaMinutes(-4.32, 15.31, -4.33, 15.32);
    expect(eta).toBeGreaterThanOrEqual(1);
    expect(eta).toBeLessThan(30);
  });

  it('resolveCourierLocation prefers driver GPS over mock', () => {
    const delivery = {
      status: DeliveryStatus.IN_TRANSIT,
      driverId: 'driver-1',
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.33,
      dropoffLng: 15.32,
    };
    const withGps = resolveCourierLocation(delivery, { userId: 'driver-1', lat: -4.325, lng: 15.315 });
    expect(withGps).toEqual({ lat: -4.325, lng: 15.315, ts: expect.any(Number) });

    const noGps = resolveCourierLocation(delivery, { userId: 'driver-1', lat: null, lng: null });
    expect(noGps).toEqual({ lat: -4.32, lng: 15.31, ts: expect.any(Number) });

    const unassigned = resolveCourierLocation({ ...delivery, driverId: null }, null);
    expect(unassigned).toEqual(
      mockCourierLocation({
        status: delivery.status,
        pickupLat: delivery.pickupLat,
        pickupLng: delivery.pickupLng,
        dropoffLat: delivery.dropoffLat,
        dropoffLng: delivery.dropoffLng,
      }),
    );
  });

  it('buildParcelTimeline uses Glovo-style food labels', () => {
    const timeline = buildParcelTimeline(
      { status: DeliveryStatus.PICKED_UP, type: DeliveryType.FOOD },
      [],
    );
    expect(timeline.map((s) => s.label)).toEqual([
      'Confirmé',
      'Préparation',
      'En route',
      'Livré',
    ]);
    expect(timeline[0]?.done).toBe(true);
    expect(timeline[1]?.done).toBe(true);
    expect(timeline[2]?.done).toBe(true);
    expect(timeline[3]?.done).toBe(false);
  });

  it('buildParcelTimeline advances for restaurant food statuses', () => {
    const confirmed = buildParcelTimeline(
      { status: DeliveryStatus.RESTAURANT_CONFIRMED, type: DeliveryType.FOOD },
      [],
    );
    expect(confirmed[0]?.done).toBe(true);
    expect(confirmed[1]?.done).toBe(true);
    expect(confirmed[2]?.done).toBe(false);

    const ready = buildParcelTimeline(
      { status: DeliveryStatus.READY_FOR_PICKUP, type: DeliveryType.FOOD },
      [],
    );
    expect(ready[1]?.done).toBe(true);
    expect(ready[2]?.done).toBe(false);
  });
});
