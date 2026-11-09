import { GeocodeProvider, isPreciseMatch } from './geocode.provider';
import { MapboxService } from './mapbox.service';
import { NominatimService } from './nominatim.service';
import { PhotonService } from './photon.service';

const place = (label: string, lat: number, lng: number) => ({
  label,
  address: `${label}, Kinshasa`,
  lat,
  lng,
  commune: 'Gombe',
  city: 'Kinshasa',
});

function make(opts: { mapbox?: unknown[]; photon?: unknown[]; nominatim?: unknown[]; configured?: boolean }) {
  const mapbox = {
    isConfigured: () => opts.configured !== false,
    search: jest.fn().mockResolvedValue(opts.mapbox ?? []),
    searchCategory: jest.fn().mockResolvedValue(opts.mapbox ?? []),
  };
  const photon = {
    search: jest.fn().mockResolvedValue(opts.photon ?? []),
    searchByCategory: jest.fn().mockResolvedValue(opts.photon ?? []),
    reverse: jest.fn(),
  };
  const nominatim = { search: jest.fn().mockResolvedValue(opts.nominatim ?? []), reverse: jest.fn() };
  const provider = new GeocodeProvider(
    mapbox as unknown as MapboxService,
    nominatim as unknown as NominatimService,
    photon as unknown as PhotonService,
  );
  return { provider, mapbox, photon, nominatim };
}

describe('GeocodeProvider — cheapest first, Mapbox last', () => {
  it('OpenStreetMap (Photon) answers: Mapbox is not called', async () => {
    const t = make({ photon: [place('Marché de la Victoire', -4.338, 15.317)], mapbox: [place('X', -4.3, 15.3)] });
    const r = await t.provider.search('victoire');
    expect(r.map((p) => p.provider)).toEqual(['photon']);
    expect(t.mapbox.search).not.toHaveBeenCalled();
    expect(t.nominatim.search).not.toHaveBeenCalled();
  });

  it('Photon empty: Nominatim, still no Mapbox', async () => {
    const t = make({ nominatim: [place('Hôtel Memling', -4.31, 15.31)] });
    const r = await t.provider.search('memling');
    expect(r.map((p) => p.provider)).toEqual(['nominatim']);
    expect(t.mapbox.search).not.toHaveBeenCalled();
  });

  it('nothing in OpenStreetMap: Mapbox as last resort', async () => {
    const t = make({ mapbox: [place('Pharmacie du Fleuve', -4.3, 15.31)] });
    const r = await t.provider.search('pharmacie du fleuve');
    expect(r.map((p) => p.provider)).toEqual(['mapbox']);
    expect(t.mapbox.search).toHaveBeenCalledTimes(1);
  });

  it('the SENGA base already has a precise match: no Mapbox', async () => {
    const t = make({ mapbox: [place('X', -4.3, 15.3)] });
    expect(await t.provider.search('gombe', { localHitCount: 2, localPreciseHit: true })).toEqual([]);
    expect(t.mapbox.search).not.toHaveBeenCalled();
  });

  it('OpenStreetMap only approximate (the commune): Mapbox completes, its result first', async () => {
    const t = make({
      photon: [place('Gombe', -4.305, 15.312)],
      mapbox: [place('Pharmacie du Fleuve', -4.301, 15.315)],
    });
    const r = await t.provider.search('pharmacie du fleuve');
    expect(r.map((p) => p.provider)).toEqual(['mapbox', 'photon']);
  });

  it('isPreciseMatch: every meaningful word, accents ignored', () => {
    expect(isPreciseMatch('pharmacie du fleuve', 'Pharmacie du Fleuve', 'Gombe')).toBe(true);
    expect(isPreciseMatch('pharmacie du fleuve', 'Gombe', 'Kinshasa')).toBe(false);
    expect(isPreciseMatch('universite kinshasa', 'Université de Kinshasa', null)).toBe(true);
    expect(isPreciseMatch('Hôtel Memling', 'Hotel Memling', 'Gombe')).toBe(true);
  });

  it('Mapbox not configured: empty, no error', async () => {
    const t = make({ configured: false });
    expect(await t.provider.search('rien')).toEqual([]);
    expect(t.mapbox.search).not.toHaveBeenCalled();
  });

  it('category browse: Mapbox only completes a thin list', async () => {
    const many = Array.from({ length: 6 }, (_, i) => place(`Taxi ${i}`, -4.3 - i / 100, 15.3));
    const rich = make({ photon: many, mapbox: [place('M', -4.2, 15.2)] });
    expect((await rich.provider.searchCategory('PHARMACY')).length).toBe(6);
    expect(rich.mapbox.searchCategory).not.toHaveBeenCalled();

    const thin = make({ photon: [place('Taxi A', -4.3, 15.3)], mapbox: [place('Taxi M', -4.2, 15.2)] });
    const r = await thin.provider.searchCategory('PHARMACY');
    expect(r.map((p) => p.provider)).toContain('mapbox');
  });
});
