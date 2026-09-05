import { RDC_MAP_CENTER } from '@mova/shared';
import { resolveDrcProximity } from './drc-proximity';

describe('resolveDrcProximity', () => {
  it('uses GPS when the point is inside DRC (Goma)', () => {
    expect(resolveDrcProximity({ lat: -1.6788, lng: 29.2175 })).toEqual({
      lat: -1.6788,
      lng: 29.2175,
    });
  });

  it('uses GPS for Lubumbashi, Kisangani and Matadi', () => {
    expect(resolveDrcProximity({ lat: -11.6647, lng: 27.4794 })).toMatchObject({
      lat: -11.6647,
      lng: 27.4794,
    });
    expect(resolveDrcProximity({ lat: 0.5153, lng: 25.191 })).toMatchObject({
      lat: 0.5153,
      lng: 25.191,
    });
    expect(resolveDrcProximity({ lat: -5.8167, lng: 13.45 })).toMatchObject({
      lat: -5.8167,
      lng: 13.45,
    });
  });

  it('uses selected city center when GPS is missing', () => {
    const p = resolveDrcProximity({ city: 'Lubumbashi' });
    expect(p.lat).toBeCloseTo(-11.6647, 3);
    expect(p.lng).toBeCloseTo(27.4794, 3);
  });

  it('falls back to RDC centroid, not Kinshasa', () => {
    const p = resolveDrcProximity();
    expect(p).toEqual({ lat: RDC_MAP_CENTER.lat, lng: RDC_MAP_CENTER.lng });
    expect(p.lng).not.toBeCloseTo(15.3125, 1);
  });
});
