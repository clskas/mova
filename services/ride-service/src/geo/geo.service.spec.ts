import { GeoService } from './geo.service';

describe('GeoService.autocomplete', () => {
  const prisma = {
    commune: { findMany: jest.fn().mockResolvedValue([]) },
    placeOfInterest: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const poiImport = { ensureSeeded: jest.fn() };
  const geocode = {
    search: jest.fn().mockResolvedValue([]),
  };
  const cityActivation = {};

  const service = new GeoService(
    prisma as never,
    poiImport as never,
    geocode as never,
    cityActivation as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.commune.findMany.mockResolvedValue([]);
    prisma.placeOfInterest.findMany.mockResolvedValue([]);
    geocode.search.mockResolvedValue([]);
  });

  it('classe un POI utilisateur au-dessus de Mapbox', async () => {
    prisma.placeOfInterest.findMany.mockResolvedValue([
      {
        id: 'u1',
        name: 'Chez Mama X',
        address: 'Lingwala',
        lat: -4.325,
        lng: 15.308,
        city: 'Kinshasa',
        category: 'OTHER',
        source: 'USER',
      },
    ]);
    geocode.search.mockResolvedValue([
      {
        provider: 'mapbox',
        label: 'Chez Mama, Kinshasa',
        address: 'Chez Mama, Kinshasa, RDC',
        lat: -4.32,
        lng: 15.31,
        commune: 'Gombe',
        city: 'Kinshasa',
      },
    ]);

    const results = await service.autocomplete('chez mama', 'Kinshasa', { lat: -4.32, lng: 15.31 });

    expect(results[0]).toMatchObject({
      source: 'poi',
      catalogSource: 'USER',
      poiId: 'u1',
    });
    expect(results.some((r) => r.source === 'mapbox')).toBe(true);
  });

  it('catégorie hôpitaux interroge toujours Mapbox/OSM (Search Box + Photon)', async () => {
    geocode.search.mockResolvedValue([
      {
        provider: 'mapbox',
        label: 'Hôpital Général de Kinshasa',
        address: 'Hôpital Général, Kinshasa',
        lat: -4.34,
        lng: 15.3,
        commune: 'Lingwala',
        city: 'Kinshasa',
        category: 'HOSPITAL',
      },
    ]);

    const results = await service.autocomplete(
      'hôpital',
      'Kinshasa',
      { lat: -4.32, lng: 15.31 },
      'HOSPITAL',
    );

    expect(geocode.search).toHaveBeenCalledWith(
      'hôpital',
      expect.objectContaining({
        poiCategory: 'HOSPITAL',
        bounded: true,
        viewbox: expect.objectContaining({
          minLat: expect.any(Number),
          maxLat: expect.any(Number),
        }),
      }),
    );
    expect(results.some((r) => r.source === 'mapbox' && r.category === 'HOSPITAL')).toBe(true);
  });
});
