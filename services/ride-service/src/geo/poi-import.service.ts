import { Injectable, Logger } from '@nestjs/common';
import { PlaceOfInterestCategory } from '@prisma/client';
import { DRC_SERVICE_AREAS, getServiceArea } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  KINSHASA_POI_SEED,
  MIN_POI_KINSHASA,
  MIN_POI_PER_CITY,
  OSM_TAG_TO_CATEGORY,
  PoiSeedRow,
  buildRegionalPoiSeed,
} from './poi-seed.data';

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

@Injectable()
export class PoiImportService {
  private readonly logger = new Logger(PoiImportService.name);

  constructor(private prisma: PrismaService) {}

  async seedKinshasa(): Promise<{ imported: number; skipped: number }> {
    return this.upsertRows(KINSHASA_POI_SEED);
  }

  async seedAllServiceAreas(): Promise<{ imported: number; skipped: number }> {
    return this.upsertRows(buildRegionalPoiSeed());
  }

  async seedCity(city: string): Promise<{ imported: number; skipped: number }> {
    const rows = buildRegionalPoiSeed().filter((r) => r.city.toLowerCase() === city.toLowerCase());
    if (rows.length === 0) return { imported: 0, skipped: 0 };
    return this.upsertRows(rows);
  }

  private async upsertRows(rows: PoiSeedRow[]) {
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const existing = await this.prisma.placeOfInterest.findFirst({
        where: { OR: [{ osmId: row.osmId }, { name: row.name, city: row.city, lat: row.lat, lng: row.lng }] },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await this.prisma.placeOfInterest.create({
        data: {
          osmId: row.osmId,
          name: row.name,
          category: row.category,
          lat: row.lat,
          lng: row.lng,
          city: row.city,
          address: row.address,
          source: 'OSM',
        },
      });
      imported++;
    }
    return { imported, skipped };
  }

  /** Import Overpass API sur la bbox de la ville MOVA demandée (ou Kinshasa par défaut). */
  async importFromOverpass(
    city = 'Kinshasa',
    bbox?: { south: number; west: number; north: number; east: number },
  ) {
    const area = getServiceArea(city) ?? DRC_SERVICE_AREAS.find((a) => a.name.toLowerCase() === city.toLowerCase());
    const targetCity = area?.name ?? city;
    const targetBox = bbox ??
      (area
        ? {
            south: area.bounds.minLat,
            west: area.bounds.minLng,
            north: area.bounds.maxLat,
            east: area.bounds.maxLng,
          }
        : { south: -4.55, west: 15.12, north: -4.25, east: 15.45 });

    const query = `
      [out:json][timeout:60];
      (
        node["amenity"~"marketplace|hospital|clinic|university|college|pharmacy|school|bus_station|train_station"](${targetBox.south},${targetBox.west},${targetBox.north},${targetBox.east});
        way["amenity"~"marketplace|hospital|clinic|university|college|pharmacy|school|bus_station|train_station"](${targetBox.south},${targetBox.west},${targetBox.north},${targetBox.east});
      );
      out center;
    `;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) {
      this.logger.warn(`Overpass API failed: ${res.status}`);
      return this.seedCity(targetCity);
    }
    const data = (await res.json()) as { elements?: OverpassElement[] };
    const rows: PoiSeedRow[] = [];
    for (const el of data.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const tags = el.tags ?? {};
      const name = tags.name ?? tags['name:fr'];
      if (!lat || !lng || !name) continue;
      const amenity = tags.amenity ?? '';
      const category = OSM_TAG_TO_CATEGORY[amenity] ?? 'OTHER';
      rows.push({
        osmId: `osm-${el.id}`,
        name,
        category: category as PlaceOfInterestCategory,
        lat,
        lng,
        city: targetCity,
        address: tags['addr:street'] ? `${tags['addr:street']}, ${targetCity}` : undefined,
      });
    }
    if (rows.length === 0) {
      this.logger.warn(`Overpass returned 0 POI for ${targetCity} — fallback city seed`);
      return this.seedCity(targetCity);
    }
    return this.upsertRows(rows);
  }

  async importAllServiceAreasFromOverpass() {
    let imported = 0;
    let skipped = 0;
    const errors: Array<{ city: string; error: string }> = [];

    for (const area of DRC_SERVICE_AREAS) {
      try {
        const result = await this.importFromOverpass(area.name);
        imported += result.imported;
        skipped += result.skipped;
      } catch (err) {
        errors.push({
          city: area.name,
          error: err instanceof Error ? err.message : String(err),
        });
        const fallback = await this.seedCity(area.name);
        imported += fallback.imported;
        skipped += fallback.skipped;
      }
    }

    return { imported, skipped, errors };
  }

  async ensureSeeded() {
    const cityNames = DRC_SERVICE_AREAS.map((a) => a.name);
    let imported = 0;
    let skipped = 0;
    for (const cityName of cityNames) {
      const count = await this.prisma.placeOfInterest.count({ where: { city: cityName } });
      const min = cityName === 'Kinshasa' ? MIN_POI_KINSHASA : MIN_POI_PER_CITY;
      if (count >= min) continue;
      const result = await this.seedCity(cityName);
      imported += result.imported;
      skipped += result.skipped;
    }

    const staticNames = new Set(cityNames.map((n) => n.toLowerCase()));
    const extraCities = await this.prisma.city.findMany({
      where: { isActive: true },
      select: { name: true, centerLat: true, centerLng: true, province: { select: { name: true } } },
    });
    for (const city of extraCities) {
      if (staticNames.has(city.name.toLowerCase())) continue;
      const count = await this.prisma.placeOfInterest.count({ where: { city: city.name } });
      if (count >= MIN_POI_PER_CITY) continue;
      const result = await this.seedCityFromCenter(city.name, city.centerLat, city.centerLng, city.province.name);
      imported += result.imported;
      skipped += result.skipped;
    }

    const total = await this.prisma.placeOfInterest.count();
    return { total, imported, skipped, cities: cityNames.length };
  }

  private async seedCityFromCenter(cityName: string, centerLat: number, centerLng: number, province: string) {
    const slug = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const templates: PoiSeedRow[] = [
      { osmId: `mova-${slug}-market`, name: `Marché ${cityName}`, category: 'MARKET', lat: centerLat + 0.004, lng: centerLng + 0.003, city: cityName, address: `Centre-ville, ${cityName}` },
      { osmId: `mova-${slug}-hospital`, name: `Hôpital Général ${cityName}`, category: 'HOSPITAL', lat: centerLat - 0.003, lng: centerLng + 0.002, city: cityName, address: `${cityName}, ${province}` },
      { osmId: `mova-${slug}-university`, name: `Université de ${cityName}`, category: 'UNIVERSITY', lat: centerLat + 0.002, lng: centerLng - 0.004, city: cityName, address: `${cityName}, ${province}` },
      { osmId: `mova-${slug}-pharmacy`, name: `Pharmacie Centre ${cityName}`, category: 'PHARMACY', lat: centerLat, lng: centerLng, city: cityName, address: `Centre-ville, ${cityName}` },
      { osmId: `mova-${slug}-school`, name: `Institut ${cityName}`, category: 'SCHOOL', lat: centerLat - 0.002, lng: centerLng - 0.003, city: cityName, address: `${cityName}, ${province}` },
      { osmId: `mova-${slug}-government`, name: `Gouvernorat ${province}`, category: 'GOVERNMENT', lat: centerLat + 0.003, lng: centerLng - 0.002, city: cityName, address: `${cityName}, ${province}` },
      { osmId: `mova-${slug}-transport`, name: `Gare routière ${cityName}`, category: 'TRANSPORT', lat: centerLat - 0.004, lng: centerLng - 0.001, city: cityName, address: `${cityName}, ${province}` },
    ];
    return this.upsertRows(templates);
  }

  async seedAllCities() {
    return this.upsertRows(buildRegionalPoiSeed());
  }
}
