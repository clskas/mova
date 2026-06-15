import { DeliveryStatus, DeliveryType } from '@prisma/client';
import {
  buildParcelTimeline,
  computeDeliveryEtaMinutes,
  generateDeliveryPin,
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
    expect(timeline[2]?.done).toBe(false);
  });
});
