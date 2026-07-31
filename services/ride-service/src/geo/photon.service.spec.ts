import { PhotonService } from './photon.service';
import * as httpFetch from '../common/http-fetch.util';

describe('PhotonService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PHOTON_ENABLED;
    delete process.env.PHOTON_BASE_URL;
  });

  it('returns empty when disabled', async () => {
    process.env.PHOTON_ENABLED = 'false';
    const service = new PhotonService();
    expect(await service.search('Gombe', { city: 'Kinshasa' })).toEqual([]);
  });

  it('maps search features to places', async () => {
    process.env.PHOTON_ENABLED = 'true';
    jest.spyOn(httpFetch, 'httpGetJson').mockResolvedValue({
      features: [
        {
          properties: {
            name: 'Avenue des Aviateurs',
            street: 'Avenue des Aviateurs',
            city: 'Kinshasa',
            state: 'Kinshasa',
            countrycode: 'CD',
            osm_type: 'W',
            osm_id: 213202741,
          },
          geometry: { coordinates: [15.3149105, -4.3011373] },
        },
      ],
    });

    const service = new PhotonService();
    const results = await service.search('Avenue des Aviateurs', { city: 'Kinshasa' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      lat: -4.3011373,
      lng: 15.3149105,
      city: 'Kinshasa',
    });
    expect(results[0].label).toContain('Avenue des Aviateurs');
  });

  it('filters non-RDC results when countrycode is set', async () => {
    process.env.PHOTON_ENABLED = 'true';
    jest.spyOn(httpFetch, 'httpGetJson').mockResolvedValue({
      features: [
        {
          properties: { name: 'Gombe', countrycode: 'NE' },
          geometry: { coordinates: [8.0, 13.0] },
        },
      ],
    });

    const service = new PhotonService();
    expect(await service.search('Gombe')).toEqual([]);
  });
});
