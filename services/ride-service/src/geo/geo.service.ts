import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DRC_SERVICE_AREAS,
  findServiceAreaByName,
  getActiveServiceAreas,
  getCommunesForArea,
  getServiceArea,
  isCityOperational,
  MovaErrorCode,
  MovaHttpException,
  RDC_TERRITORY_BOUNDS,
  resolveCityFromCoords,
} from '@mova/shared';
import { addressToCoords } from '../common/address.util';
import { PrismaService } from '../prisma/prisma.service';
import { CityActivationService } from './city-activation.service';
import { resolveDrcProximity } from './drc-proximity';
import { GeocodeProvider } from './geocode.provider';
import { TAXI_POI_CHIP_CATEGORIES, type PoiCategory } from './poi-category.map';
import { PoiImportService } from './poi-import.service';

type AutocompleteResult = {
  source: 'commune' | 'nominatim' | 'photon' | 'mapbox' | 'poi';
  label: string;
  address: string;
  lat: number;
  lng: number;
  commune: string | null;
  city: string;
  category?: string;
  poiId?: string;
};

@Injectable()
export class GeoService implements OnModuleInit {
  private readonly logger = new Logger(GeoService.name);

  constructor(
    private prisma: PrismaService,
    private poiImport: PoiImportService,
    private geocode: GeocodeProvider,
    private cityActivation: CityActivationService,
  ) {}

  async onModuleInit() {
    void this.poiImport.ensureSeeded().catch((err: unknown) => {
      this.logger.warn(`POI seed skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  listServiceAreas() {
    return getActiveServiceAreas().map((a) => ({
      id: a.id,
      name: a.name,
      province: a.province,
      centerLat: a.centerLat,
      centerLng: a.centerLng,
      bounds: a.bounds,
      timezone: a.timezone,
      isActive: true,
    }));
  }

  async listProvinces() {
    return this.prisma.province.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { cities: true } } },
    });
  }

  async createProvince(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Nom de province requis.');
    return this.prisma.province.create({ data: { name: trimmed, isActive: true } });
  }

  async updateProvince(id: string, data: { name?: string; isActive?: boolean }) {
    const existing = await this.prisma.province.findUnique({ where: { id } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Province introuvable.');
    const patch: { name?: string; isActive?: boolean } = {};
    if (typeof data.name === 'string') {
      const trimmed = data.name.trim();
      if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Nom de province requis.');
      patch.name = trimmed;
    }
    if (typeof data.isActive === 'boolean') patch.isActive = data.isActive;
    return this.prisma.province.update({ where: { id }, data: patch }).then(async (row) => {
      await this.cityActivation.refresh();
      return row;
    });
  }

  async deleteProvince(id: string) {
    const existing = await this.prisma.province.findUnique({ where: { id }, include: { _count: { select: { cities: true } } } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Province introuvable.');
    if (existing._count.cities > 0) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Supprimez d\'abord les villes de cette province.');
    }
    return this.prisma.province.delete({ where: { id } });
  }

  async listCities(provinceId?: string) {
    return this.prisma.city.findMany({
      where: provinceId ? { provinceId } : undefined,
      orderBy: [{ province: { name: 'asc' } }, { name: 'asc' }],
      include: { province: { select: { id: true, name: true } } },
    });
  }

  async createCity(data: {
    name: string;
    slug: string;
    provinceId: string;
    centerLat: number;
    centerLng: number;
    minLat?: number;
    maxLat?: number;
    minLng?: number;
    maxLng?: number;
    isActive?: boolean;
  }) {
    const radius = 0.12;
    const minLat = data.minLat ?? data.centerLat - radius;
    const maxLat = data.maxLat ?? data.centerLat + radius;
    const minLng = data.minLng ?? data.centerLng - radius;
    const maxLng = data.maxLng ?? data.centerLng + radius;
    return this.prisma.city.create({
      data: {
        name: data.name.trim(),
        slug: data.slug.trim().toLowerCase(),
        provinceId: data.provinceId,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        minLat,
        maxLat,
        minLng,
        maxLng,
        isActive: data.isActive ?? true,
      },
      include: { province: { select: { id: true, name: true } } },
    }).then(async (row) => {
      await this.cityActivation.refresh();
      return row;
    });
  }

  async updateCity(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.city.findUnique({ where: { id } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Ville introuvable.');
    const patch: Record<string, unknown> = {};
    if (typeof data.name === 'string') patch.name = data.name.trim();
    if (typeof data.slug === 'string') patch.slug = data.slug.trim().toLowerCase();
    if (typeof data.provinceId === 'string') patch.provinceId = data.provinceId;
    if (typeof data.centerLat === 'number') patch.centerLat = data.centerLat;
    if (typeof data.centerLng === 'number') patch.centerLng = data.centerLng;
    if (typeof data.minLat === 'number') patch.minLat = data.minLat;
    if (typeof data.maxLat === 'number') patch.maxLat = data.maxLat;
    if (typeof data.minLng === 'number') patch.minLng = data.minLng;
    if (typeof data.maxLng === 'number') patch.maxLng = data.maxLng;
    if (typeof data.isActive === 'boolean') patch.isActive = data.isActive;
    return this.prisma.city.update({
      where: { id },
      data: patch,
      include: { province: { select: { id: true, name: true } } },
    }).then(async (row) => {
      await this.cityActivation.refresh();
      return row;
    });
  }

  async deleteCity(id: string) {
    const existing = await this.prisma.city.findUnique({ where: { id } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Ville introuvable.');
    return this.prisma.city.delete({ where: { id } }).then(async (row) => {
      await this.cityActivation.refresh();
      return row;
    });
  }

  async setAllCitiesActive(isActive: boolean) {
    const updated = await this.cityActivation.setAllActive(isActive);
    return { isActive, count: updated.length };
  }

  async setAllProvincesActive(isActive: boolean) {
    const count = await this.cityActivation.setAllProvincesActive(isActive);
    return { isActive, count };
  }

  /** Liste villes pour admin / mobile — DB prioritaire, fallback catalogue statique. */
  async listCitiesCatalog(opts?: { activeOnly?: boolean }) {
    const activeOnly = opts?.activeOnly ?? false;
    const db = await this.listCities();
    if (db.length > 0) {
      const rows = db
        .filter((c) => !activeOnly || c.isActive)
        .map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          province: c.province.name,
          provinceId: c.provinceId,
          centerLat: c.centerLat,
          centerLng: c.centerLng,
          bounds: { minLat: c.minLat, maxLat: c.maxLat, minLng: c.minLng, maxLng: c.maxLng },
          isActive: c.isActive,
          source: 'db' as const,
        }));
      return rows;
    }
    return getActiveServiceAreas()
      .filter((a) => !activeOnly || isCityOperational(a.id, a.name))
      .map((a) => ({
        id: a.id,
        slug: a.id,
        name: a.name,
        province: a.province,
        provinceId: null,
        centerLat: a.centerLat,
        centerLng: a.centerLng,
        bounds: a.bounds,
        isActive: isCityOperational(a.id, a.name),
        source: 'static' as const,
      }));
  }

  async getCommunes(city?: string) {
    if (!city) {
      return this.prisma.commune.findMany({
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
      });
    }
    const area = findServiceAreaByName(city) ?? getServiceArea(city);
    const cityName = area?.name ?? city;
    const db = await this.prisma.commune.findMany({
      where: { city: cityName },
      orderBy: { name: 'asc' },
    });
    if (db.length > 0) return db;
    if (area) {
      return getCommunesForArea(area.id).map((d, idx) => ({
        id: `${area.id}-${idx}`,
        name: d.name,
        city: area.name,
        lat: d.lat,
        lng: d.lng,
      }));
    }
    return this.prisma.commune.findMany({ where: { city }, orderBy: { name: 'asc' } });
  }

  async createCommune(data: { name: string; city: string; lat: number; lng: number }) {
    return this.prisma.commune.create({ data });
  }

  async deleteCommune(id: string) {
    const commune = await this.prisma.commune.findUnique({ where: { id } });
    if (!commune) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Commune introuvable.');
    return this.prisma.commune.delete({ where: { id } });
  }

  async updateCommune(id: string, data: Partial<{ name: string; lat: number; lng: number; city: string }>) {
    const commune = await this.prisma.commune.findUnique({ where: { id } });
    if (!commune) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Commune introuvable.');
    return this.prisma.commune.update({ where: { id }, data });
  }

  async autocomplete(
    query: string,
    city?: string,
    near?: { lat: number; lng: number },
    category?: PoiCategory,
  ) {
    const q = query.trim();
    if (q.length < 2) return [] as AutocompleteResult[];

    const matchesQuery = (text: string) => this.textMatchesQuery(text, q);

    const seen = new Set<string>();
    const results: AutocompleteResult[] = [];

    const push = (item: AutocompleteResult) => {
      if (seen.has(item.label)) return;
      seen.add(item.label);
      results.push(item);
    };

    const primaryArea =
      city != null && city.trim() !== ''
        ? findServiceAreaByName(city) ??
          getServiceArea(city) ??
          DRC_SERVICE_AREAS.find((a) => a.name.toLowerCase() === city.toLowerCase())
        : undefined;

    const addCommune = (name: string, lat: number, lng: number, cityName: string) => {
      push({
        source: 'commune',
        label: `${name}, ${cityName}`,
        address: `${name}, ${cityName}, RDC`,
        lat,
        lng,
        commune: name,
        city: cityName,
      });
    };

    const addPoi = (p: {
      id: string;
      name: string;
      address: string | null;
      lat: number;
      lng: number;
      city: string;
      category: PoiCategory;
    }) => {
      push({
        source: 'poi',
        label: `${p.name}, ${p.city}`,
        address: p.address ?? `${p.name}, ${p.city}, RDC`,
        lat: p.lat,
        lng: p.lng,
        commune: null,
        city: p.city,
        category: p.category,
        poiId: p.id,
      });
    };

    const addSeedMatches = (areaId: string, cityName: string, existingNames: Set<string>) => {
      for (const d of getCommunesForArea(areaId)) {
        if (!d.name.toLowerCase().includes(q.toLowerCase()) || existingNames.has(d.name)) continue;
        addCommune(d.name, d.lat, d.lng, cityName);
      }
    };

    const searchDbCity = async (cityName: string, areaId?: string) => {
      const communeNames = new Set<string>();
      const communes = await this.prisma.commune.findMany({
        where: { city: cityName, name: { contains: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 10,
      });
      for (const c of communes) {
        communeNames.add(c.name);
        addCommune(c.name, c.lat, c.lng, cityName);
      }
      if (areaId) addSeedMatches(areaId, cityName, communeNames);

      const pois = await this.prisma.placeOfInterest.findMany({
        where: { city: cityName, ...(category ? { category } : {}) },
        orderBy: { name: 'asc' },
      });
      for (const p of pois) {
        if (matchesQuery(p.name) || (p.address != null && matchesQuery(p.address))) addPoi(p);
      }
    };

    const searchAreas = async (areas: typeof DRC_SERVICE_AREAS) => {
      for (const area of areas) {
        await searchDbCity(area.name, area.id);
      }
    };

    const placeMatchCount = () =>
      results.filter((r) => r.source === 'commune' || r.source === 'poi').length;
    const hasPlaceMatch = () => placeMatchCount() > 0;

    const requestedCity = city?.trim() ?? '';

    if (primaryArea) {
      await searchAreas([primaryArea]);
      if (!hasPlaceMatch()) {
        const others = DRC_SERVICE_AREAS.filter((a) => a.id !== primaryArea.id);
        await searchAreas(others);
      }
    } else if (requestedCity !== '') {
      await searchDbCity(requestedCity);
      if (!hasPlaceMatch()) {
        const others = DRC_SERVICE_AREAS.filter((a) => a.name.toLowerCase() !== requestedCity.toLowerCase());
        await searchAreas(others);
      }
    } else {
      const [communes, pois] = await Promise.all([
        this.prisma.commune.findMany({
          where: { name: { contains: q, mode: 'insensitive' } },
          orderBy: { name: 'asc' },
          take: 12,
        }),
        this.prisma.placeOfInterest.findMany({
          where: category ? { category } : undefined,
          orderBy: { name: 'asc' },
          take: 200,
        }),
      ]);
      const communeNamesByCity = new Map<string, Set<string>>();
      for (const c of communes) {
        const names = communeNamesByCity.get(c.city) ?? new Set<string>();
        names.add(c.name);
        communeNamesByCity.set(c.city, names);
        addCommune(c.name, c.lat, c.lng, c.city);
      }
      for (const p of pois) {
        if (matchesQuery(p.name) || (p.address != null && matchesQuery(p.address))) addPoi(p);
      }
      for (const area of DRC_SERVICE_AREAS) {
        addSeedMatches(area.id, area.name, communeNamesByCity.get(area.name) ?? new Set());
      }
    }

    // Toujours enrichir via géocodage externe (Mapbox Search Box / Photon / Nominatim)
    // sur le territoire RDC entier — le catalogue local (communes/POI) ne couvre
    // pas tous les lieux ; l'ancien viewbox ville + bounded=1 masquait le reste du pays.
    const biasArea =
      primaryArea ??
      DRC_SERVICE_AREAS.find((a) => a.name.toLowerCase() === requestedCity.toLowerCase()) ??
      (near != null ? DRC_SERVICE_AREAS.find((a) => {
        const b = a.bounds;
        return near.lat >= b.minLat && near.lat <= b.maxLat && near.lng >= b.minLng && near.lng <= b.maxLng;
      }) : undefined);
    const proximity = resolveDrcProximity({
      lat: near?.lat,
      lng: near?.lng,
      city: requestedCity || biasArea?.name,
    });
    const geocodeHits = await this.geocodeWithTimeout(
      q,
      {
        city: requestedCity || biasArea?.name,
        centerLat: proximity.lat,
        centerLng: proximity.lng,
        viewbox: {
          minLng: RDC_TERRITORY_BOUNDS.minLng,
          minLat: RDC_TERRITORY_BOUNDS.minLat,
          maxLng: RDC_TERRITORY_BOUNDS.maxLng,
          maxLat: RDC_TERRITORY_BOUNDS.maxLat,
        },
        bounded: true,
        limit: 10,
        poiCategory: category,
      },
      6000,
    );
    for (const p of geocodeHits) {
      const resolvedCity =
        (p.city && findServiceAreaByName(p.city)?.name) ||
        resolveCityFromCoords(p.lat, p.lng) ||
        p.city ||
        requestedCity ||
        biasArea?.name ||
        'RDC';
      push({
        source: p.provider,
        label: p.label,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        commune: p.commune ?? p.city,
        city: resolvedCity,
        category: p.category ?? category,
      });
    }

    const local = results.filter((r) => r.source === 'commune' || r.source === 'poi');
    const remote = results.filter((r) => r.source !== 'commune' && r.source !== 'poi');
    return [...local.slice(0, 8), ...remote.slice(0, 10)].slice(0, 16);
  }

  /** Géocodage externe avec timeout — évite de bloquer l'autocomplete SENGA. */
  private async geocodeWithTimeout(
    query: string,
    opts: {
      city?: string;
      centerLat?: number;
      centerLng?: number;
      viewbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
      bounded?: boolean;
      limit?: number;
      poiCategory?: PoiCategory;
    },
    timeoutMs: number,
  ) {
    try {
      return await Promise.race([
        this.geocode.search(query, opts),
        new Promise<Awaited<ReturnType<GeocodeProvider['search']>>>((resolve) =>
          setTimeout(() => resolve([]), timeoutMs),
        ),
      ]);
    } catch {
      return [];
    }
  }

  /** Géocodage texte → coordonnées (communes SENGA puis Nominatim / Mapbox). */
  async forwardGeocode(
    address: string,
    opts?: { city?: string; nearLat?: number; nearLng?: number },
  ): Promise<{ lat: number; lng: number }> {
    const trimmed = address.trim();
    if (trimmed.length < 2) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Adresse non reconnue — utilisez le GPS ou l\'autocomplétion SENGA.',
      );
    }

    try {
      return addressToCoords(trimmed);
    } catch {
      // Continue avec Nominatim / POI
    }

    const city =
      opts?.city ??
      (opts?.nearLat != null && opts?.nearLng != null
        ? resolveCityFromCoords(opts.nearLat, opts.nearLng)
        : undefined);
    const area =
      (city ? findServiceAreaByName(city) ?? getServiceArea(city) : null) ??
      (opts?.nearLat != null && opts?.nearLng != null
        ? DRC_SERVICE_AREAS.find((a) => {
            const b = a.bounds;
            return (
              opts.nearLat! >= b.minLat &&
              opts.nearLat! <= b.maxLat &&
              opts.nearLng! >= b.minLng &&
              opts.nearLng! <= b.maxLng
            );
          })
        : null) ??
      getActiveServiceAreas()[0];

    const suggestions = await this.autocomplete(trimmed, area?.name);
    if (suggestions.length > 0) {
      return { lat: suggestions[0].lat, lng: suggestions[0].lng };
    }

    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      'Adresse non reconnue — utilisez le GPS ou l\'autocomplétion SENGA.',
    );
  }

  /** Reverse geocoding OSM (Nominatim / Photon) : GPS → libellé adresse. */
  async reverseGeocode(lat: number, lng: number) {
    const place = await this.geocode.reverse(lat, lng);
    if (!place) {
      return {
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lng,
        commune: null as string | null,
        city: null as string | null,
        source: 'coords' as const,
      };
    }
    const source = place.provider;
    const { provider: _provider, ...rest } = place;
    return { ...rest, source };
  }

  async listPlaces(opts: {
    city?: string;
    category?: PoiCategory;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    limit?: number;
  }) {
    const limit = Math.min(opts.limit ?? 50, 100);
    const where: Record<string, unknown> = {};
    if (opts.category) where.category = opts.category;

    const hasGps = opts.lat != null && opts.lng != null;
    const radiusKm = opts.radiusKm ?? (opts.category ? 15 : 8);
    if (hasGps) {
      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.cos((opts.lat! * Math.PI) / 180));
      where.lat = { gte: opts.lat! - latDelta, lte: opts.lat! + latDelta };
      where.lng = { gte: opts.lng! - lngDelta, lte: opts.lng! + lngDelta };
    } else if (opts.city) {
      where.city = opts.city;
    }

    const rows = await this.prisma.placeOfInterest.findMany({
      where,
      orderBy: { name: 'asc' },
      take: hasGps ? undefined : limit,
    });

    const live = await this.fetchLivePlaces(opts, radiusKm, limit);
    const merged = this.mergePlaceRows(rows, live, {
      lat: opts.lat,
      lng: opts.lng,
      radiusKm: hasGps ? radiusKm : undefined,
      limit,
    });
    return merged;
  }

  private async fetchLivePlaces(
    opts: {
      city?: string;
      category?: PoiCategory;
      lat?: number;
      lng?: number;
    },
    _radiusKm: number,
    limit: number,
  ) {
    const categories = opts.category ? [opts.category] : TAXI_POI_CHIP_CATEGORIES;
    const proximity = resolveDrcProximity({
      lat: opts.lat,
      lng: opts.lng,
      city: opts.city,
    });
    const viewbox = {
      minLng: RDC_TERRITORY_BOUNDS.minLng,
      minLat: RDC_TERRITORY_BOUNDS.minLat,
      maxLng: RDC_TERRITORY_BOUNDS.maxLng,
      maxLat: RDC_TERRITORY_BOUNDS.maxLat,
    };

    const batches = await Promise.all(
      categories.map(async (category) => {
        try {
          const hits = await Promise.race([
            this.geocode.searchCategory(category, {
              city: opts.city,
              centerLat: proximity.lat,
              centerLng: proximity.lng,
              viewbox,
              bounded: true,
              limit: Math.min(limit, 15),
            }),
            new Promise<Awaited<ReturnType<GeocodeProvider['searchCategory']>>>((resolve) =>
              setTimeout(() => resolve([]), 5000),
            ),
          ]);
          return hits.map((p) => ({
            id: `live-${p.provider}-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}`,
            osmId: null as string | null,
            name: p.label.split(',')[0]?.trim() || p.label,
            category: (p.category ?? category) as PoiCategory,
            lat: p.lat,
            lng: p.lng,
            city:
              (p.city && findServiceAreaByName(p.city)?.name) ||
              resolveCityFromCoords(p.lat, p.lng) ||
              p.city ||
              opts.city ||
              'RDC',
            address: p.address,
            source: p.provider === 'mapbox' ? 'MAPBOX' : 'OSM',
          }));
        } catch {
          return [];
        }
      }),
    );
    return batches.flat();
  }

  private mergePlaceRows(
    dbRows: Array<{
      id: string;
      osmId?: string | null;
      name: string;
      category: PoiCategory;
      lat: number;
      lng: number;
      city: string;
      address: string | null;
      source: string;
    }>,
    liveRows: Array<{
      id: string;
      osmId?: string | null;
      name: string;
      category: PoiCategory;
      lat: number;
      lng: number;
      city: string;
      address: string | null;
      source: string;
    }>,
    opts: { lat?: number; lng?: number; radiusKm?: number; limit: number },
  ) {
    const seen = new Set<string>();
    const out: Array<(typeof liveRows)[number] & { distanceKm?: number }> = [];
    const push = (row: (typeof dbRows)[number]) => {
      const key = `${row.lat.toFixed(4)},${row.lng.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const distanceKm =
        opts.lat != null && opts.lng != null
          ? this.haversineKm(opts.lat, opts.lng, row.lat, row.lng)
          : undefined;
      if (distanceKm != null && opts.radiusKm != null && distanceKm > opts.radiusKm) return;
      out.push({
        ...row,
        ...(distanceKm != null ? { distanceKm: Math.round(distanceKm * 100) / 100 } : {}),
      });
    };

    for (const row of dbRows) push(row);
    for (const row of liveRows) push(row);

    if (opts.lat != null && opts.lng != null) {
      out.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }
    return out.slice(0, opts.limit);
  }

  async importPois(city = 'Kinshasa', useOverpass = false) {
    const target = city.trim();
    const national = target.toLowerCase() === 'rdc' || target.toLowerCase() === 'all';
    if (useOverpass && national) return this.poiImport.importAllServiceAreasFromOverpass();
    if (useOverpass) return this.poiImport.importFromOverpass(target);
    if (national) return this.poiImport.seedAllCities();
    if (city && city.toLowerCase() !== 'kinshasa') return this.poiImport.seedCity(city);
    return this.poiImport.seedAllCities();
  }

  private normalizeSearchText(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private textMatchesQuery(text: string, query: string) {
    return this.normalizeSearchText(text).includes(this.normalizeSearchText(query));
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
