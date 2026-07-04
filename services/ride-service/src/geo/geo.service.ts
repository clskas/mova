import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PlaceOfInterestCategory } from '@prisma/client';
import {
  DRC_SERVICE_AREAS,
  findServiceAreaByName,
  getActiveServiceAreas,
  getCommunesForArea,
  getServiceArea,
  MovaErrorCode,
  MovaHttpException,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NominatimService } from './nominatim.service';
import { PoiImportService } from './poi-import.service';

type AutocompleteResult = {
  source: 'commune' | 'nominatim' | 'mapbox' | 'poi';
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
    private nominatim: NominatimService,
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
    return this.prisma.province.create({ data: { name: trimmed } });
  }

  async updateProvince(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Nom de province requis.');
    const existing = await this.prisma.province.findUnique({ where: { id } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Province introuvable.');
    return this.prisma.province.update({ where: { id }, data: { name: trimmed } });
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
    });
  }

  async deleteCity(id: string) {
    const existing = await this.prisma.city.findUnique({ where: { id } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Ville introuvable.');
    return this.prisma.city.delete({ where: { id } });
  }

  /** Liste villes pour admin / mobile — DB prioritaire, fallback catalogue statique. */
  async listCitiesCatalog() {
    const db = await this.listCities();
    if (db.length > 0) {
      return db.map((c) => ({
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
    }
    return getActiveServiceAreas().map((a) => ({
      id: a.id,
      slug: a.id,
      name: a.name,
      province: a.province,
      provinceId: null,
      centerLat: a.centerLat,
      centerLng: a.centerLng,
      bounds: a.bounds,
      isActive: a.active,
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

    const areas = city
      ? [findServiceAreaByName(city) ?? getServiceArea(city) ?? DRC_SERVICE_AREAS.find((a) => a.name.toLowerCase() === city.toLowerCase())].filter(Boolean)
      : getActiveServiceAreas();

    const results: AutocompleteResult[] = [];

    for (const area of areas) {
      if (!area) continue;
      const cityName = area.name;

      const communes = await this.prisma.commune.findMany({
        where: { city: cityName, name: { contains: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 10,
      });

      const seedDistricts = getCommunesForArea(area.id);
      const seedMatches = seedDistricts
        .filter((d) => d.name.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 10);

      results.push(
        ...communes.map((c) => ({
          source: 'commune' as const,
          label: `${c.name}, ${cityName}`,
          address: `${c.name}, ${cityName}, RDC`,
          lat: c.lat,
          lng: c.lng,
          commune: c.name,
          city: cityName,
        })),
        ...seedMatches
          .filter((d) => !communes.some((c) => c.name === d.name))
          .map((d) => ({
            source: 'commune' as const,
            label: `${d.name}, ${cityName}`,
            address: `${d.name}, ${cityName}, RDC`,
            lat: d.lat,
            lng: d.lng,
            commune: d.name,
            city: cityName,
          })),
      );

      const pois = await this.prisma.placeOfInterest.findMany({
        where: {
          city: cityName,
          name: { contains: q, mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
        take: 8,
      });
      results.push(
        ...pois.map((p) => ({
          source: 'poi' as const,
          label: `${p.name}, ${cityName}`,
          address: p.address ?? `${p.name}, ${cityName}, RDC`,
          lat: p.lat,
          lng: p.lng,
          commune: null,
          city: cityName,
          category: p.category,
          poiId: p.id,
        })),
      );

      const nominatimHits = await this.nominatim.search(q, {
        city: cityName,
        centerLat: area.centerLat,
        centerLng: area.centerLng,
        viewbox: area.bounds,
        limit: 5,
      });
      results.push(
        ...nominatimHits.map((p) => ({
          source: 'nominatim' as const,
          label: p.label,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          commune: p.commune,
          city: p.city ?? cityName,
        })),
      );

      if (process.env.MAPBOX_ACCESS_TOKEN && nominatimHits.length === 0) {
        try {
          const encoded = encodeURIComponent(`${q}, ${cityName}, RDC`);
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${process.env.MAPBOX_ACCESS_TOKEN}&country=cd&limit=5&proximity=${area.centerLng},${area.centerLat}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            for (const feature of data.features ?? []) {
              const [lng, lat] = feature.center ?? [];
              if (lat == null || lng == null) continue;
              results.push({
                source: 'mapbox' as const,
                label: feature.place_name ?? feature.text,
                address: feature.place_name ?? feature.text,
                lat,
                lng,
                commune: feature.context?.find((c: { id: string }) => c.id.startsWith('place'))?.text ?? null,
                city: cityName,
              });
            }
          }
        } catch {
          // Mapbox optionnel — Nominatim + communes + POI suffisent
        }
      }
    }

    return results.slice(0, 12);
  }

  /** Reverse geocoding OSM (Nominatim) : GPS → libellé adresse. */
  async reverseGeocode(lat: number, lng: number) {
    const place = await this.nominatim.reverse(lat, lng);
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
    return { ...place, source: 'nominatim' as const };
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
    if (opts.city) where.city = opts.city;
    if (opts.category) where.category = opts.category;

    const rows = await this.prisma.placeOfInterest.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit * 3,
    });

    if (opts.lat != null && opts.lng != null) {
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

    return rows.slice(0, limit);
  }

  async importPois(city = 'Kinshasa', useOverpass = false) {
    if (useOverpass) return this.poiImport.importFromOverpass(city);
    return this.poiImport.seedKinshasa();
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
