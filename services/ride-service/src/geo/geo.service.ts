import { Injectable } from '@nestjs/common';
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

type AutocompleteResult = {
  source: 'commune' | 'mapbox';
  label: string;
  address: string;
  lat: number;
  lng: number;
  commune: string | null;
  city: string;
};

@Injectable()
export class GeoService {
  constructor(private prisma: PrismaService) {}

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

      if (process.env.MAPBOX_ACCESS_TOKEN) {
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
          // Mapbox optional — communes fallback only
        }
      }
    }

    return results.slice(0, 10);
  }
}
