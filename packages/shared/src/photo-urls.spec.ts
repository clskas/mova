import { normalizePhotoUrls, resolveVehiclePhotos, vehiclePhotoList } from './photo-urls';

describe('vehicle photos', () => {
  it('keeps at most 5 clean, distinct URLs', () => {
    expect(normalizePhotoUrls([' a ', 'b', '', 'a', 3, 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(normalizePhotoUrls('a')).toEqual([]);
  });

  it('uses the first photo of a list as imageUrl', () => {
    expect(resolveVehiclePhotos({ photoUrls: ['x', 'y'], imageUrl: 'old' })).toEqual({ photoUrls: ['x', 'y'], imageUrl: 'x' });
  });

  it('turns a single imageUrl from an older app into a list of one', () => {
    expect(resolveVehiclePhotos({ imageUrl: 'solo' })).toEqual({ photoUrls: ['solo'], imageUrl: 'solo' });
    expect(resolveVehiclePhotos({ photoUrls: [], imageUrl: null })).toEqual({ photoUrls: [], imageUrl: null });
  });

  it('shows the legacy imageUrl when no list is stored', () => {
    expect(vehiclePhotoList({ photoUrls: null, imageUrl: 'legacy' })).toEqual(['legacy']);
    expect(vehiclePhotoList({ photoUrls: ['p1', 'p2'], imageUrl: 'p1' })).toEqual(['p1', 'p2']);
  });
});
