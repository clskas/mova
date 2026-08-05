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

  it('maps features with country=cd and national bbox', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';
    jest.spyOn(httpFetch, 'httpGetJson').mockResolvedValue({
      features: [
        {
          place_name: 'Goma, Nord-Kivu, Democratic Republic of the Congo',
          text: 'Goma',
          center: [29.2175, -1.6788],
          context: [
            { id: 'region.1', text: 'Nord-Kivu' },
            { id: 'country.2', text: 'Democratic Republic of the Congo' },
          ],
        },
      ],
    });

    const service = new MapboxService();
    expect(service.isConfigured()).toBe(true);
    const results = await service.search('Goma', { centerLat: -4.32, centerLng: 15.31 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ lat: -1.6788, lng: 29.2175, label: expect.stringContaining('Goma') });

    const calledUrl = (httpFetch.httpGetJson as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('country=cd');
    expect(calledUrl).toContain('bbox=12');
    expect(calledUrl).toContain('proximity=15.31');
  });
});
