import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeoService {
  constructor(private prisma: PrismaService) {}

  getCommunes(city = 'Kinshasa') {
    return this.prisma.commune.findMany({ where: { city }, orderBy: { name: 'asc' } });
  }

  async updateCommune(id: string, data: Partial<{ name: string; lat: number; lng: number; city: string }>) {
    const commune = await this.prisma.commune.findUnique({ where: { id } });
    if (!commune) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Commune introuvable.');
    return this.prisma.commune.update({ where: { id }, data });
  }

  async autocomplete(query: string, city = 'Kinshasa') {
    const q = query.trim();
    if (q.length < 2) return [];

    const communes = await this.prisma.commune.findMany({
      where: { city, name: { contains: q, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 10,
    });

    const results = communes.map((c) => ({
      source: 'commune',
      label: `${c.name}, Kinshasa`,
      address: `${c.name}, Kinshasa, RDC`,
      lat: c.lat,
      lng: c.lng,
      commune: c.name,
      city: c.city,
    }));

    if (process.env.MAPBOX_ACCESS_TOKEN) {
      try {
        const encoded = encodeURIComponent(`${q}, Kinshasa, RDC`);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${process.env.MAPBOX_ACCESS_TOKEN}&country=cd&limit=5&proximity=15.3125,-4.3217`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          for (const feature of data.features ?? []) {
            const [lng, lat] = feature.center ?? [];
            if (lat == null || lng == null) continue;
            results.push({
              source: 'mapbox',
              label: feature.place_name ?? feature.text,
              address: feature.place_name ?? feature.text,
              lat,
              lng,
              commune: feature.context?.find((c: { id: string }) => c.id.startsWith('place'))?.text ?? null,
              city: 'Kinshasa',
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
