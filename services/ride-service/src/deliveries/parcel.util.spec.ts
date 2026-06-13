import { DeliveryStatus, DeliveryType } from '@prisma/client';
import { MovaHttpException } from '@mova/shared';
import { assertKinshasaCoords, buildParcelTimeline, detectCommune } from './parcel.util';

describe('parcel.util', () => {
  it('détecte une commune Kinshasa depuis l\'adresse', () => {
    expect(detectCommune(-4.32, 15.31, 'Avenue Batetela, Gombe')).toBe('Gombe');
  });

  it('rejette les coordonnées hors Kinshasa', () => {
    expect(() => assertKinshasaCoords(0, 0)).toThrow(MovaHttpException);
  });

  it('construit une timeline de suivi colis', () => {
    const timeline = buildParcelTimeline({ status: DeliveryStatus.IN_TRANSIT, type: DeliveryType.PARCEL });
    expect(timeline).toHaveLength(4);
    expect(timeline[2].done).toBe(true);
    expect(timeline[3].done).toBe(false);
  });

  it('construit une timeline repas distincte', () => {
    const timeline = buildParcelTimeline({ status: DeliveryStatus.PENDING, type: DeliveryType.FOOD });
    expect(timeline[0].label).toContain('restaurant');
  });
});
