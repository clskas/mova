import { GeocodeProvider } from './geocode.provider';
import { MapboxService } from './mapbox.service';
import { NominatimService } from './nominatim.service';
import { PhotonService } from './photon.service';

describe('GeocodeProvider', () => {
  afterEach(() => {
    delete process.env.GEOCODE_PREFER_PHOTON;
  });

  it('merges Mapbox and Photon instead of returning Mapbox exclusively', async () => {
    const mapbox = {
      isConfigured: () => true,
      search: jest.fn().mockResolvedValue([
        {
          label: 'Gombe, Kinshasa',
          address: 'Gombe, Kinshasa, RDC',
          lat: -4.305,
          lng: 15.312,
          commune: 'Gombe',
          city: 'Kinshasa',
          featureType: 'neighborhood',
        },
      ]),
    };
    const photon = {
      search: jest.fn().mockResolvedValue([
        {
          label: 'Marché de la Victoire, Kalamu',
          address: 'Marché de la Victoire, Kalamu, Kinshasa',
          lat: -4.338,
          lng: 15.317,
          commune: 'Kalamu',
          city: 'Kinshasa',
        },
      ]),
      reverse: jest.fn(),
    };
    const nominatim = { search: jest.fn(), reverse: jest.fn() };

    const provider = new GeocodeProvider(
      mapbox as unknown as MapboxService,
      nominatim as unknown as NominatimService,
      photon as unknown as PhotonService,
    );

    const results = await provider.search('victoire', {
      centerLat: -4.32,
      centerLng: 15.31,
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.provider)).toEqual(['mapbox', 'photon']);
    expect(nominatim.search).not.toHaveBeenCalled();
  });

  it('dedupes overlapping Mapbox and Photon coordinates', async () => {
    const mapbox = {
      isConfigured: () => true,
      search: jest.fn().mockResolvedValue([
        {
          label: 'Hôtel Memling',
          address: 'Hôtel Memling, Gombe',
          lat: -4.30512,
          lng: 15.31321,
          commune: 'Gombe',
          city: 'Kinshasa',
          featureType: 'poi',
        },
      ]),
    };
    const photon = {
      search: jest.fn().mockResolvedValue([
        {
          label: 'Hotel Memling',
          address: 'Hotel Memling, Gombe',
          lat: -4.30511,
          lng: 15.31319,
          commune: 'Gombe',
          city: 'Kinshasa',
        },
      ]),
      reverse: jest.fn(),
    };

    const provider = new GeocodeProvider(
      mapbox as unknown as MapboxService,
      { search: jest.fn(), reverse: jest.fn() } as unknown as NominatimService,
      photon as unknown as PhotonService,
    );

    const results = await provider.search('memling');
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('mapbox');
  });

  it('searchCategory merges Mapbox category hits with Photon OSM tags', async () => {
    const mapbox = {
      isConfigured: () => true,
      search: jest.fn(),
      searchCategory: jest.fn().mockResolvedValue([
        {
          label: 'Hôpital Provincial, Goma',
          address: 'Goma',
          lat: -1.674,
          lng: 29.228,
          commune: null,
          city: 'Goma',
          category: 'HOSPITAL',
        },
      ]),
    };
    const photon = {
      search: jest.fn(),
      searchByCategory: jest.fn().mockResolvedValue([
        {
          label: 'Clinique Kyeshero, Goma',
          address: 'Goma',
          lat: -1.681,
          lng: 29.21,
          commune: null,
          city: 'Goma',
          category: 'HOSPITAL',
        },
      ]),
      reverse: jest.fn(),
    };

    const nominatim = { search: jest.fn().mockResolvedValue([]), reverse: jest.fn() };
    const provider = new GeocodeProvider(
      mapbox as unknown as MapboxService,
      nominatim as unknown as NominatimService,
      photon as unknown as PhotonService,
    );

    const results = await provider.searchCategory('HOSPITAL', {
      centerLat: -1.6788,
      centerLng: 29.2175,
    });
    expect(results).toHaveLength(2);
    expect(mapbox.searchCategory).toHaveBeenCalledWith(
      'HOSPITAL',
      expect.objectContaining({ centerLat: -1.6788, centerLng: 29.2175 }),
    );
    expect(photon.searchByCategory).toHaveBeenCalled();
    expect(nominatim.search).toHaveBeenCalled();
  });

  it('searchCategory falls back to Nominatim when Mapbox and Photon are thin', async () => {
    const mapbox = {
      isConfigured: () => true,
      search: jest.fn(),
      searchCategory: jest.fn().mockResolvedValue([]),
    };
    const photon = {
      search: jest.fn(),
      searchByCategory: jest.fn().mockResolvedValue([]),
      reverse: jest.fn(),
    };
    const nominatim = {
      search: jest.fn().mockResolvedValue([
        {
          label: 'Hôpital Général de Kinshasa',
          address: 'Gombe, Kinshasa',
          lat: -4.3278,
          lng: 15.3089,
          commune: 'Gombe',
          city: 'Kinshasa',
        },
      ]),
      reverse: jest.fn(),
    };

    const provider = new GeocodeProvider(
      mapbox as unknown as MapboxService,
      nominatim as unknown as NominatimService,
      photon as unknown as PhotonService,
    );

    const results = await provider.searchCategory('HOSPITAL', {
      centerLat: -4.32,
      centerLng: 15.31,
    });
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('nominatim');
    expect(results[0].category).toBe('HOSPITAL');
  });
});
