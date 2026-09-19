import { DeliveryStatus, DeliveryType } from '@prisma/client';
import {
  buildParcelTimeline,
  computeDeliveryEtaMinutes,
  foodClientStatusLabel,
  formatParcelDelivery,
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
    expect(withGps).toEqual({ lat: -4.325, lng: 15.315, ts: expect.any(Number), source: 'gps' });

    const noGps = resolveCourierLocation(delivery, { userId: 'driver-1', lat: null, lng: null });
    expect(noGps).toEqual({ lat: -4.32, lng: 15.31, ts: expect.any(Number), source: 'pickup' });

    const unassigned = resolveCourierLocation({ ...delivery, driverId: null }, null);
    const expected = mockCourierLocation({
      status: delivery.status,
      pickupLat: delivery.pickupLat,
      pickupLng: delivery.pickupLng,
      dropoffLat: delivery.dropoffLat,
      dropoffLng: delivery.dropoffLng,
    });
    expect(unassigned).toMatchObject({ lat: expected.lat, lng: expected.lng, source: 'estimated' });
    expect(unassigned?.ts).toEqual(expect.any(Number));
  });

  it('buildParcelTimeline uses Glovo-style food labels', () => {
    const timeline = buildParcelTimeline(
      { status: DeliveryStatus.PICKED_UP, type: DeliveryType.FOOD },
      [],
    );
    expect(timeline.map((s) => s.label)).toEqual([
      'Envoyée au restaurant',
      'Acceptée',
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

  it('foodClientStatusLabel distingue acceptée unpaid vs préparation', () => {
    expect(foodClientStatusLabel(DeliveryStatus.PENDING)).toBe('En attente du restaurant');
    expect(
      foodClientStatusLabel(DeliveryStatus.RESTAURANT_CONFIRMED, { guaranteed: true, escrowReady: false }),
    ).toBe('Acceptée — en attente de votre paiement');
    expect(
      foodClientStatusLabel(DeliveryStatus.RESTAURANT_CONFIRMED, { guaranteed: true, escrowReady: true }),
    ).toBe('En préparation');
    expect(
      foodClientStatusLabel(DeliveryStatus.RESTAURANT_CONFIRMED, { guaranteed: false, escrowReady: false }),
    ).toBe('En préparation');
  });

  it('formatParcelDelivery paymentReady : COD uniquement après DELIVERED', () => {
    const base = {
      id: 'd1',
      userId: 'u1',
      type: DeliveryType.PARCEL,
      status: DeliveryStatus.IN_TRANSIT,
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.33,
      dropoffLng: 15.32,
      pickupAddress: 'A',
      dropoffAddress: 'B',
      deliveryLat: -4.33,
      deliveryLng: 15.32,
      deliveryAddress: 'B',
      estimatedPriceCdf: 5000,
      finalPriceCdf: null,
      distanceKm: 2,
      durationMin: 10,
      photoUrl: null,
      weightCategory: null,
      restaurantId: null,
      restaurant: null,
      deliveryPin: '1234',
      driverId: 'drv',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
      guaranteed: false,
      escrowReady: false,
      escrowAmountCdf: null,
      fundsFrozenAt: null,
      payoutReleasedAt: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(formatParcelDelivery({ ...base, status: DeliveryStatus.IN_TRANSIT }).paymentReady).toBe(false);
    expect(formatParcelDelivery({ ...base, status: DeliveryStatus.DELIVERED }).paymentReady).toBe(true);
    expect(
      formatParcelDelivery({ ...base, type: DeliveryType.EXPRESS, status: DeliveryStatus.DELIVERED }).paymentReady,
    ).toBe(true);
    expect(
      formatParcelDelivery({ ...base, type: DeliveryType.FOOD, status: DeliveryStatus.IN_TRANSIT }).paymentReady,
    ).toBe(false);
    expect(
      formatParcelDelivery({ ...base, type: DeliveryType.FOOD, status: DeliveryStatus.DELIVERED }).paymentReady,
    ).toBe(true);
  });
});
