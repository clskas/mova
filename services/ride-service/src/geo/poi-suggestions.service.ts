import { HttpStatus, Injectable } from '@nestjs/common';
import { PlaceOfInterestCategory, PoiSuggestionStatus, Prisma } from '@prisma/client';
import {
  findServiceAreaByCoords,
  findServiceAreaByName,
  MovaErrorCode,
  MovaHttpException,
} from '@mova/shared';
import { assertServiceAreaCoords } from '../common/address.util';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovePoiSuggestionDto, CreatePoiSuggestionDto, RejectPoiSuggestionDto } from './poi-suggestions.dto';

const MAX_PENDING_PER_USER = 10;
const DUPLICATE_RADIUS_KM = 0.15;

const OSM_AMENITY_BY_CATEGORY: Partial<Record<PlaceOfInterestCategory, string>> = {
  MARKET: 'marketplace',
  HOSPITAL: 'hospital',
  UNIVERSITY: 'university',
  PHARMACY: 'pharmacy',
  SCHOOL: 'school',
  GOVERNMENT: 'townhall',
  TRANSPORT: 'bus_station',
};

@Injectable()
export class PoiSuggestionsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreatePoiSuggestionDto) {
    const name = dto.name.trim();
    assertServiceAreaCoords(dto.lat, dto.lng);

    const area = findServiceAreaByName(dto.city) ?? findServiceAreaByCoords(dto.lat, dto.lng);
    const city = area?.name ?? dto.city.trim();

    const pendingCount = await this.prisma.poiSuggestion.count({
      where: { userId, status: PoiSuggestionStatus.PENDING },
    });
    if (pendingCount >= MAX_PENDING_PER_USER) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Trop de suggestions en attente. Attendez la validation de vos lieux précédents.',
      );
    }

    await this.assertNotDuplicate(name, dto.lat, dto.lng, city);

    const row = await this.prisma.poiSuggestion.create({
      data: {
        userId,
        name,
        category: dto.category,
        lat: dto.lat,
        lng: dto.lng,
        city,
        address: dto.address?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });

    return {
      ...this.formatSuggestion(row),
      message: 'Suggestion envoyée. Un administrateur validera le lieu avant publication.',
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.poiSuggestion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((r) => this.formatSuggestion(r));
  }

  async listForAdmin(opts: { status?: PoiSuggestionStatus; skip?: number; take?: number }) {
    const where: Prisma.PoiSuggestionWhereInput = {};
    if (opts.status) where.status = opts.status;
    const skip = opts.skip ?? 0;
    const take = Math.min(opts.take ?? 50, 100);
    const [rows, total] = await Promise.all([
      this.prisma.poiSuggestion.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.poiSuggestion.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.formatSuggestion(r)),
      total,
      skip,
      take,
    };
  }

  async approve(id: string, dto: ApprovePoiSuggestionDto) {
    const suggestion = await this.prisma.poiSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Suggestion introuvable.');
    if (suggestion.status !== PoiSuggestionStatus.PENDING) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.CONFLICT, 'Cette suggestion a déjà été traitée.');
    }

    await this.assertNotDuplicate(suggestion.name, suggestion.lat, suggestion.lng, suggestion.city, suggestion.id);

    const poi = await this.prisma.placeOfInterest.create({
      data: {
        name: suggestion.name,
        category: suggestion.category,
        lat: suggestion.lat,
        lng: suggestion.lng,
        city: suggestion.city,
        address: suggestion.address ?? `${suggestion.name}, ${suggestion.city}, RDC`,
        source: 'USER',
      },
    });

    const updated = await this.prisma.poiSuggestion.update({
      where: { id },
      data: {
        status: PoiSuggestionStatus.APPROVED,
        reviewedBy: dto.reviewedBy?.trim() || 'admin',
        reviewedAt: new Date(),
        publishedPoiId: poi.id,
      },
    });

    return {
      suggestion: this.formatSuggestion(updated),
      poi,
      osm: this.buildOsmContribution(suggestion),
      message: 'Lieu publié dans MOVA. Contribuez aussi sur OpenStreetMap via le lien fourni.',
    };
  }

  async reject(id: string, dto: RejectPoiSuggestionDto) {
    const suggestion = await this.prisma.poiSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, undefined, 'Suggestion introuvable.');
    if (suggestion.status !== PoiSuggestionStatus.PENDING) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.CONFLICT, 'Cette suggestion a déjà été traitée.');
    }

    const updated = await this.prisma.poiSuggestion.update({
      where: { id },
      data: {
        status: PoiSuggestionStatus.REJECTED,
        rejectionReason: dto.reason?.trim() || 'Non conforme aux critères MOVA.',
        reviewedBy: dto.reviewedBy?.trim() || 'admin',
        reviewedAt: new Date(),
      },
    });

    return {
      suggestion: this.formatSuggestion(updated),
      message: 'Suggestion refusée.',
    };
  }

  private async assertNotDuplicate(name: string, lat: number, lng: number, city: string, excludeSuggestionId?: string) {
    const existingPoi = await this.prisma.placeOfInterest.findFirst({
      where: {
        city,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (existingPoi && this.haversineKm(lat, lng, existingPoi.lat, existingPoi.lng) <= DUPLICATE_RADIUS_KM) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.CONFLICT,
        'Ce lieu existe déjà dans MOVA.',
      );
    }

    const nearby = await this.prisma.poiSuggestion.findMany({
      where: {
        status: { in: [PoiSuggestionStatus.PENDING, PoiSuggestionStatus.APPROVED] },
        city,
        ...(excludeSuggestionId ? { id: { not: excludeSuggestionId } } : {}),
      },
      take: 200,
    });
    const normalized = name.toLowerCase();
    for (const row of nearby) {
      const close = this.haversineKm(lat, lng, row.lat, row.lng) <= DUPLICATE_RADIUS_KM;
      const sameName = row.name.toLowerCase() === normalized;
      if (close && sameName) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          HttpStatus.CONFLICT,
          'Une suggestion similaire existe déjà pour ce lieu.',
        );
      }
    }
  }

  private buildOsmContribution(suggestion: {
    name: string;
    category: PlaceOfInterestCategory;
    lat: number;
    lng: number;
    address?: string | null;
    notes?: string | null;
  }) {
    const amenity = OSM_AMENITY_BY_CATEGORY[suggestion.category];
    const tags: Record<string, string> = { name: suggestion.name };
    if (amenity) tags.amenity = amenity;

    return {
      viewUrl: `https://www.openstreetmap.org/#map=19/${suggestion.lat}/${suggestion.lng}`,
      editUrl: `https://www.openstreetmap.org/edit#map=19/${suggestion.lat}/${suggestion.lng}`,
      tags,
      instructions:
        'Ouvrez l\'éditeur OSM, ajoutez un point (node) à ces coordonnées, renseignez les tags ci-dessus. Après indexation Nominatim (24–48 h), le lieu sera aussi trouvable via la recherche OSM.',
      note: suggestion.notes ?? undefined,
    };
  }

  private formatSuggestion(row: {
    id: string;
    userId: string;
    name: string;
    category: PlaceOfInterestCategory;
    lat: number;
    lng: number;
    city: string;
    address: string | null;
    notes: string | null;
    status: PoiSuggestionStatus;
    rejectionReason: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    publishedPoiId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      category: row.category,
      lat: row.lat,
      lng: row.lng,
      city: row.city,
      address: row.address,
      notes: row.notes,
      status: row.status,
      rejectionReason: row.rejectionReason,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      publishedPoiId: row.publishedPoiId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      osm: this.buildOsmContribution(row),
    };
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
