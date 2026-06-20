import { Injectable } from '@nestjs/common';
import { TrackingReferenceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type GpsTracePoint = { lat: number; lng: number; recordedAt: string };

const MS_PER_DAY = 86_400_000;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  normalizeType(value: string): TrackingReferenceType {
    const upper = value.toUpperCase();
    if (upper === 'RIDE') return TrackingReferenceType.RIDE;
    if (upper === 'DELIVERY') return TrackingReferenceType.DELIVERY;
    if (upper === 'ERRAND') return TrackingReferenceType.ERRAND;
    if (upper === 'MOVING') return TrackingReferenceType.MOVING;
    throw new Error(`Type de suivi GPS invalide: ${value}`);
  }

  async recordPoint(referenceType: TrackingReferenceType, referenceId: string, lat: number, lng: number) {
    if (!referenceId?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return { recorded: false };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { recorded: false };

    const last = await this.prisma.trackingPoint.findFirst({
      where: { referenceType, referenceId },
      orderBy: { recordedAt: 'desc' },
    });
    if (last) {
      const elapsedMs = Date.now() - last.recordedAt.getTime();
      const distKm = haversineKm(last.lat, last.lng, lat, lng);
      if (elapsedMs < 8000 && distKm < 0.008) return { recorded: false, skipped: true };
    }

    const point = await this.prisma.trackingPoint.create({
      data: { referenceType, referenceId, lat, lng },
    });
    return {
      recorded: true,
      point: { lat: point.lat, lng: point.lng, recordedAt: point.recordedAt.toISOString() },
    };
  }

  async getTrace(referenceType: TrackingReferenceType, referenceId: string, limit = 2000): Promise<GpsTracePoint[]> {
    const rows = await this.prisma.trackingPoint.findMany({
      where: { referenceType, referenceId },
      orderBy: { recordedAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 5000),
      select: { lat: true, lng: true, recordedAt: true },
    });
    return rows.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      recordedAt: r.recordedAt.toISOString(),
    }));
  }

  async getTraceSummary(referenceType: TrackingReferenceType, referenceId: string, limit = 2000) {
    const points = await this.getTrace(referenceType, referenceId, limit);
    return {
      referenceType,
      referenceId,
      pointCount: points.length,
      points,
      lastPoint: points.length > 0 ? points[points.length - 1] : null,
    };
  }
}
