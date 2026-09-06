import { MapboxService } from './mapbox.service';
import * as httpFetch from '../common/http-fetch.util';

describe('MapboxService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.MAPBOX_GEOCODE_ENABLED;
  });

  it('returns empty when token missing', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    const service = new MapboxService();
    expect(service.isConfigured()).toBe(false);
    expect(await service.search('Goma')).toEqual([]);
  });

  it('uses Search Box forward with poi types, country=cd and proximity', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';
    jest.spyOn(httpFetch, 'httpGetJson').mockImplementation(async (url: string) => {
      if (!url.includes('/search/searchbox/v1/forward')) return { features: [] };
      if (url.includes('types=poi')) {
        return {
          features: [
            {
              geometry: { coordinates: [15.313, -4.305] },
              properties: {
                name: 'Hôtel Memling',
                full_address: 'Hôtel Memling, Gombe, Kinshasa, RDC',
                feature_type: 'poi',
                context: {
                  place: { name: 'Kinshasa' },
                  neighborhood: { name: 'Gombe' },
                  country: { country_code: 'CD' },
                },
              },
            },
          ],
        };
      }
      return {
        features: [
          {
            geometry: { coordinates: [15.3125, -4.3217] },
            properties: {
              name: 'Gombe',
              full_address: 'Gombe, Kinshasa, RDC',
              feature_type: 'neighborhood',
              context: {
                place: { name: 'Kinshasa' },
                neighborhood: { name: 'Gombe' },
                country: { country_code: 'CD' },
              },
            },
          },
        ],
      };
    });

    const service = new MapboxService();
    expect(service.isConfigured()).toBe(true);
    const results = await service.search('Memling', { centerLat: -4.32, centerLng: 15.31 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toMatchObject({
      lat: -4.305,
      lng: 15.313,
      featureType: 'poi',
    });
    expect(results[0].label).toContain('Memling');

    const urls = (httpFetch.httpGetJson as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('/search/searchbox/v1/forward'))).toBe(true);
    expect(urls.some((u) => u.includes('types=poi'))).toBe(true);
    expect(urls.every((u) => u.includes('country=cd'))).toBe(true);
    expect(urls.every((u) => u.includes('language=fr'))).toBe(true);
    expect(urls.every((u) => u.includes('proximity=15.31'))).toBe(true);
    expect(urls.every((u) => u.includes('auto_complete=true'))).toBe(true);
    expect(urls.every((u) => u.includes('bbox=12'))).toBe(true);
    expect(urls.every((u) => !u.includes('/geocoding/v5/mapbox.places'))).toBe(true);
  });

  it('falls back to Geocoding v5 when Search Box is empty', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';
    jest.spyOn(httpFetch, 'httpGetJson').mockImplementation(async (url: string) => {
      if (url.includes('/search/searchbox/')) return { features: [] };
      return {
        features: [
          {
            place_name: 'Goma, Nord-Kivu, Democratic Republic of the Congo',
            text: 'Goma',
            center: [29.2175, -1.6788],
            place_type: ['place'],
            context: [
              { id: 'region.1', text: 'Nord-Kivu' },
              { id: 'country.2', text: 'Democratic Republic of the Congo' },
            ],
          },
        ],
      };
    });

    const service = new MapboxService();
    const results = await service.search('Goma');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ lat: -1.6788, lng: 29.2175 });

    const urls = (httpFetch.httpGetJson as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('/geocoding/v5/mapbox.places'))).toBe(true);
    expect(urls.some((u) => u.includes('proximity=23.66'))).toBe(true);
  });

  it('biases Search Box to Lubumbashi GPS, not Kinshasa', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';
    jest.spyOn(httpFetch, 'httpGetJson').mockResolvedValue({ features: [] });
    const service = new MapboxService();
    await service.search('Kenya', { centerLat: -11.6647, centerLng: 27.4794, city: 'Lubumbashi' });
    const urls = (httpFetch.httpGetJson as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes('country=cd'))).toBe(true);
    expect(urls.every((u) => u.includes('bbox=12'))).toBe(true);
    expect(urls.every((u) => u.includes('proximity=27.4794'))).toBe(true);
    expect(urls.every((u) => !u.includes('proximity=15.31'))).toBe(true);
  });

  it('browses POI category via Search Box /category with national bbox', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';
    jest.spyOn(httpFetch, 'httpGetJson').mockImplementation(async (url: string) => {
      if (!url.includes('/search/searchbox/v1/category/hospital')) return { features: [] };
      return {
        features: [
          {
            geometry: { coordinates: [29.228, -1.674] },
            properties: {
              name: 'Hôpital Provincial du Nord-Kivu',
              full_address: 'Hôpital Provincial, Goma, RDC',
              feature_type: 'poi',
              poi_category_ids: ['hospital'],
              context: {
                place: { name: 'Goma' },
                country: { country_code: 'CD' },
              },
            },
          },
        ],
      };
    });

    const service = new MapboxService();
    const results = await service.searchCategory('HOSPITAL', {
      centerLat: -1.6788,
      centerLng: 29.2175,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toMatchObject({
      lat: -1.674,
      lng: 29.228,
      category: 'HOSPITAL',
    });

    const urls = (httpFetch.httpGetJson as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('/search/searchbox/v1/category/hospital'))).toBe(true);
    expect(urls.every((u) => u.includes('country=cd'))).toBe(true);
    expect(urls.every((u) => u.includes('bbox=12'))).toBe(true);
    expect(urls.every((u) => u.includes('proximity=29.2175'))).toBe(true);
  });
});
