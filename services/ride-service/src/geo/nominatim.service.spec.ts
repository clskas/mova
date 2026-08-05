import { NominatimService } from './nominatim.service';
import * as httpFetch from '../common/http-fetch.util';

describe('NominatimService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NOMINATIM_ENABLED;
    delete process.env.NOMINATIM_BASE_URL;
    delete process.env.NOMINATIM_MIN_INTERVAL_MS;
  });

  it('returns empty when disabled', async () => {
    process.env.NOMINATIM_ENABLED = 'false';
    const service = new NominatimService();
    const results = await service.search('Gombe', { city: 'Kinshasa' });
    expect(results).toEqual([]);
  });

  it('maps search hits to places', async () => {
    process.env.NOMINATIM_ENABLED = 'true';
    process.env.NOMINATIM_MIN_INTERVAL_MS = '0';
    jest.spyOn(httpFetch, 'httpGetJson').mockResolvedValue([
      {
        display_name: 'Avenue du Commerce, Gombe, Kinshasa, RDC',
        lat: '-4.3210',
        lon: '15.3120',
        osm_type: 'way',
        osm_id: 123,
        address: { road: 'Avenue du Commerce', suburb: 'Gombe', city: 'Kinshasa' },
      },
    ]);

    const service = new NominatimService();
    const results = await service.search('Avenue du Commerce', {
      city: 'Kinshasa',
      centerLat: -4.32,
      centerLng: 15.31,
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      label: 'Avenue du Commerce, Gombe, Kinshasa, RDC',
      lat: -4.321,
      lng: 15.312,
      commune: 'Gombe',
      city: 'Kinshasa',
    });
    const calledUrl = (httpFetch.httpGetJson as jest.Mock).mock.calls[0][0] as string;
    const decoded = decodeURIComponent(calledUrl.replace(/\+/g, ' '));
    expect(calledUrl).toContain('countrycodes=cd');
    expect(calledUrl).toContain('bounded=1');
    // Viewbox nationale RDC (pas bbox Kinshasa seule)
    expect(calledUrl).toContain('viewbox=12');
    expect(decoded).toContain('République Démocratique du Congo');
    // Ne doit pas forcer « Kinshasa » dans le texte de recherche
    expect(decoded).not.toMatch(/q=[^&]*Kinshasa/);
    expect(httpFetch.httpGetJson).toHaveBeenCalledWith(
      expect.stringContaining('/search?'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      }),
    );
  });

  it('reverse geocodes coordinates', async () => {
    process.env.NOMINATIM_ENABLED = 'true';
    process.env.NOMINATIM_MIN_INTERVAL_MS = '0';
    jest.spyOn(httpFetch, 'httpGetJson').mockResolvedValue({
      display_name: 'Marché Gambela, Lingwala, Kinshasa',
      lat: '-4.3250',
      lon: '15.3050',
      address: { suburb: 'Lingwala', city: 'Kinshasa' },
    });

    const service = new NominatimService();
    const place = await service.reverse(-4.325, 15.305);
    expect(place?.label).toContain('Marché Gambela');
    expect(place?.city).toBe('Kinshasa');
  });
});
