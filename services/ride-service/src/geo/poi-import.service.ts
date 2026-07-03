import { Injectable, Logger } from '@nestjs/common';
import { PlaceOfInterestCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KINSHASA_POI_SEED, OSM_TAG_TO_CATEGORY, PoiSeedRow } from './poi-seed.data';

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

  /** Import Overpass API — bbox Kinshasa par défaut. */
  async importFromOverpass(city = 'Kinshasa', bbox = { south: -4.55, west: 15.12, north: -4.25, east: 15.45 }) {
    const query = `
      [out:json][timeout:60];
      (
        node["amenity"~"marketplace|hospital|clinic|university|college|pharmacy|school|bus_station|train_station"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        way["amenity"~"marketplace|hospital|clinic|university|college|pharmacy|school|bus_station|train_station"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
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
      return this.seedKinshasa();
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
        city,
        address: tags['addr:street'] ? `${tags['addr:street']}, ${city}` : undefined,
      });
    }
    if (rows.length === 0) {
      this.logger.warn('Overpass returned 0 POI — fallback seed Kinshasa');
      return this.seedKinshasa();
    }
    return this.upsertRows(rows);
  }

  async ensureSeeded() {
    const count = await this.prisma.placeOfInterest.count();
    if (count > 0) return { alreadySeeded: true, count };
    const result = await this.seedKinshasa();
    return { alreadySeeded: false, ...result };
  }
}
