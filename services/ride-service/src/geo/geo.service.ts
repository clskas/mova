import { Injectable } from '@nestjs/common';
import {
  DRC_SERVICE_AREAS,
  findServiceAreaByName,
  getActiveServiceAreas,
  getCommunesForArea,
  getServiceArea,
  MARKET_RDC,
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

  getCommunes(city: string = MARKET_RDC.defaultCity) {
    const area = findServiceAreaByName(city) ?? getServiceArea(city);
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

  async updateCommune(id: string, data: Partial<{ name: string; lat: number; lng: number; city: string }>) {
    const commune = await this.prisma.commune.findUnique({ where: { id } });
    if (!commune) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Commune introuvable.');
    return this.prisma.commune.update({ where: { id }, data });
  }

  async autocomplete(query: string, city: string = MARKET_RDC.defaultCity) {
    const q = query.trim();
    if (q.length < 2) return [] as AutocompleteResult[];

    const area = findServiceAreaByName(city) ?? getServiceArea(city) ?? DRC_SERVICE_AREAS.find((a) => a.name.toLowerCase() === city.toLowerCase());
    const cityName = area?.name ?? city;

    const communes = await this.prisma.commune.findMany({
      where: { city: cityName, name: { contains: q, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 10,
    });

    const seedDistricts = area ? getCommunesForArea(area.id) : [];
    const seedMatches = seedDistricts
      .filter((d) => d.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 10);

    const results: AutocompleteResult[] = [
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
    ];

    if (process.env.MAPBOX_ACCESS_TOKEN && area) {
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

    return results.slice(0, 10);
  }
}
