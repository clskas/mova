import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PlaceOfInterestCategory } from '@prisma/client';
import {
  DRC_SERVICE_AREAS,
  findServiceAreaByName,
  getActiveServiceAreas,
  getCommunesForArea,
  getServiceArea,
  isCityOperational,
  MovaErrorCode,
  MovaHttpException,
  resolveCityFromCoords,
} from '@mova/shared';
import { addressToCoords } from '../common/address.util';
import { PrismaService } from '../prisma/prisma.service';
import { CityActivationService } from './city-activation.service';
import { GeocodeProvider } from './geocode.provider';
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

  async autocomplete(query: string, city?: string) {
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
      category: PlaceOfInterestCategory;
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
        where: { city: cityName },
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

    // Enrichit via géocodage externe (Photon/Nominatim) tant que le catalogue
    // local reste pauvre : évite qu'une seule correspondance générique masque
    // tous les lieux réels d'une ville.
    const MIN_LOCAL_RESULTS = 5;
    if (placeMatchCount() < MIN_LOCAL_RESULTS) {
      const geocodeArea =
        primaryArea ??
        DRC_SERVICE_AREAS.find((a) => a.name.toLowerCase() === requestedCity.toLowerCase()) ??
        DRC_SERVICE_AREAS[0];
      if (geocodeArea) {
        const geocodeHits = await this.geocodeWithTimeout(
          q,
          {
            city: requestedCity !== '' ? requestedCity : geocodeArea.name,
            centerLat: geocodeArea.centerLat,
            centerLng: geocodeArea.centerLng,
            viewbox: geocodeArea.bounds,
            limit: 5,
          },
          6000,
        );
        for (const p of geocodeHits) {
          push({
            source: p.provider,
            label: p.label,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
            commune: p.commune ?? p.city,
            city: requestedCity !== '' ? requestedCity : geocodeArea.name,
          });
        }
      }
    }

    return results.slice(0, 12);
  }

  /** Géocodage externe avec timeout — évite de bloquer l'autocomplete SENGA. */
  private async geocodeWithTimeout(
    query: string,
    opts: {
      city?: string;
      centerLat?: number;
      centerLng?: number;
      viewbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
      limit?: number;
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
    category?: PlaceOfInterestCategory;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    limit?: number;
  }) {
    const limit = Math.min(opts.limit ?? 50, 100);
    const where: Record<string, unknown> = {};
    if (opts.category) where.category = opts.category;

    const hasGps = opts.lat != null && opts.lng != null;
    if (hasGps) {
      const radiusKm = opts.radiusKm ?? 5;
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

    if (hasGps) {
      const radiusKm = opts.radiusKm ?? 5;
      const filtered = rows
        .map((p) => ({
          ...p,
          distanceKm: this.haversineKm(opts.lat!, opts.lng!, p.lat, p.lng),
        }))
        .filter((p) => p.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit);
      return filtered.map(({ distanceKm, ...p }) => ({ ...p, distanceKm: Math.round(distanceKm * 100) / 100 }));
    }

    return rows;
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
