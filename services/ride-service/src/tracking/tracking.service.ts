import { HttpStatus, Injectable } from '@nestjs/common';
import { TrackingReferenceType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
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

  async assertUserCanAccess(
    referenceType: TrackingReferenceType,
    referenceId: string,
    userId: string,
  ): Promise<void> {
    const allowed = await this.userCanAccessReference(referenceType, referenceId, userId);
    if (!allowed) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
  }

  async userCanAccessReference(
    referenceType: TrackingReferenceType,
    referenceId: string,
    userId: string,
  ): Promise<boolean> {
    if (!userId?.trim() || !referenceId?.trim()) return false;
    if (referenceType === TrackingReferenceType.RIDE) return this.isRideParticipant(referenceId, userId);
    if (referenceType === TrackingReferenceType.DELIVERY) return this.isDeliveryParticipant(referenceId, userId);
    if (referenceType === TrackingReferenceType.ERRAND) return this.isErrandParticipant(referenceId, userId);
    if (referenceType === TrackingReferenceType.MOVING) return this.isMovingParticipant(referenceId, userId);
    return false;
  }

  async isRideParticipant(rideId: string, userId: string): Promise<boolean> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: { passengerId: true, driverId: true },
    });
    if (!ride) return false;
    return ride.passengerId === userId || ride.driverId === userId;
  }

  async isDeliveryParticipant(deliveryId: string, userId: string): Promise<boolean> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        userId: true,
        driverId: true,
        restaurantId: true,
        items: true,
        restaurant: { select: { ownerUserId: true } },
      },
    });
    if (!delivery) return false;
    if (delivery.userId === userId || delivery.driverId === userId) return true;
    if (delivery.restaurant?.ownerUserId === userId) return true;
    return this.isRestaurantOwnerOnDelivery(delivery, userId);
  }

  async isErrandParticipant(errandId: string, userId: string): Promise<boolean> {
    const order = await this.prisma.errandOrder.findUnique({
      where: { id: errandId },
      select: { userId: true, driverId: true },
    });
    if (!order) return false;
    return order.userId === userId || order.driverId === userId;
  }

  async isMovingParticipant(movingId: string, userId: string): Promise<boolean> {
    const moving = await this.prisma.movingRequest.findUnique({
      where: { id: movingId },
      select: { userId: true, driverId: true },
    });
    if (!moving) return false;
    return moving.userId === userId || moving.driverId === userId;
  }

  async isRentalParticipant(inquiryId: string, userId: string): Promise<boolean> {
    const inquiry = await this.prisma.rentalInquiry.findUnique({
      where: { id: inquiryId },
      select: { userId: true, driverId: true, vehicle: { select: { ownerUserId: true } } },
    });
    if (!inquiry) return false;
    return (
      inquiry.userId === userId ||
      inquiry.driverId === userId ||
      inquiry.vehicle?.ownerUserId === userId
    );
  }

  /** `delivery:subscribe` is also used for errand and moving IDs. */
  async canJoinCourierRoom(referenceId: string, userId: string): Promise<boolean> {
    if (await this.isDeliveryParticipant(referenceId, userId)) return true;
    if (await this.isErrandParticipant(referenceId, userId)) return true;
    if (await this.isMovingParticipant(referenceId, userId)) return true;
    return false;
  }

  private deliveryIncludesRestaurant(items: unknown, restaurantId: string): boolean {
    if (!Array.isArray(items)) return false;
    return items.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return (entry as { restaurantId?: string }).restaurantId === restaurantId;
    });
  }

  private async isRestaurantOwnerOnDelivery(
    delivery: { restaurantId: string | null; items: unknown },
    userId: string,
  ): Promise<boolean> {
    const owned = await this.prisma.restaurant.findMany({
      where: { ownerUserId: userId, isActive: true },
      select: { id: true },
    });
    if (!owned.length) return false;
    return owned.some(
      (restaurant) =>
        delivery.restaurantId === restaurant.id ||
        this.deliveryIncludesRestaurant(delivery.items, restaurant.id),
    );
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
