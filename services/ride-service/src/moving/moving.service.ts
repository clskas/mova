import { HttpStatus, Injectable } from '@nestjs/common';
import { MovingRequestStatus, SurchargeType, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, MOVA_EVENTS, formatCdf } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { buildMovingTimeline } from '../deliveries/parcel.util';
import { assertServiceAreaPair } from '../common/address.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { assertDriverCanReceiveJobs } from '../common/driver-eligibility.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { SurchargeService } from '../rides/surcharge.service';
import { CreateMovingDto, EstimateMovingDto } from './moving.dto';

@Injectable()
export class MovingService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private surcharges: SurchargeService,
    private redis: RedisService,
  ) {}

  private validateCoords(dto: EstimateMovingDto) {
    assertServiceAreaPair(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
  }

  async estimate(dto: EstimateMovingDto) {
    const { pickupArea, dropoffArea, isInterCity } = assertServiceAreaPair(
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
    );
    const moving = await this.surcharges.get(SurchargeType.MOVING);
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 15) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin, pickupArea.name);
    const withInterCity = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const perM3 = moving.perUnitCdf ?? 8000;
    const volumeFee = Math.ceil(dto.volumeM3 * perM3);
    const estimatedPriceCdf = Math.ceil(withInterCity.estimatedFareCdf * moving.multiplier + moving.baseFeeCdf + volumeFee);
    return {
      estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      currency: 'CDF',
      city: pickupArea.name,
      pickupCity: pickupArea.name,
      dropoffCity: dropoffArea.name,
      isInterCity,
      volumeM3: dto.volumeM3,
      volumeFeeCdf: volumeFee,
      baseFeeCdf: moving.baseFeeCdf,
      distanceKm,
      durationMin,
    };
  }

  async create(userId: string, dto: CreateMovingDto) {
    const estimate = await this.estimate(dto);
    const request = await this.prisma.movingRequest.create({
      data: {
        userId,
        status: MovingRequestStatus.PENDING,
        volumeM3: dto.volumeM3,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress.trim(),
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress.trim(),
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
        photoUrls: dto.photoUrls?.length ? dto.photoUrls : undefined,
      },
    });
    return { moving: request, estimate };
  }

  async list(userId: string) {
    return this.prisma.movingRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private formatMovingDetail(request: {
    id: string;
    status: MovingRequestStatus;
    completedAt: Date | null;
    estimatedPriceCdf: number;
    photoUrls: unknown;
    [key: string]: unknown;
  }) {
    const timeline = buildMovingTimeline(request.status, request.completedAt);
    const photoUrls = Array.isArray(request.photoUrls) ? (request.photoUrls as string[]) : [];
    return {
      ...request,
      photoUrls,
      timeline,
      tracking: timeline,
      paymentReady: request.status === MovingRequestStatus.COMPLETED,
      priceCdf: request.estimatedPriceCdf,
      formattedPrice: formatCdf(request.estimatedPriceCdf),
      currency: 'CDF',
      city: 'Kinshasa',
    };
  }

  async get(id: string, userId: string) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return this.formatMovingDetail(request);
  }

  async getForParticipant(id: string, userId: string) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.userId !== userId && request.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    return this.formatMovingDetail(request);
  }

  async updateStatusByDriver(id: string, driverId: string, status: MovingRequestStatus) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.driverId !== driverId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const allowed: Record<MovingRequestStatus, MovingRequestStatus[]> = {
      [MovingRequestStatus.PENDING]: [MovingRequestStatus.IN_PROGRESS],
      [MovingRequestStatus.ASSIGNED]: [MovingRequestStatus.IN_PROGRESS],
      [MovingRequestStatus.IN_PROGRESS]: [MovingRequestStatus.COMPLETED],
      [MovingRequestStatus.COMPLETED]: [],
      [MovingRequestStatus.CANCELLED]: [],
    };
    if (!allowed[request.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.MOVING_INVALID_STATUS);
    }
    if (status === MovingRequestStatus.IN_PROGRESS) {
      await assertDriverCanReceiveJobs(driverId);
    }
    const updates: Record<string, unknown> = { status };
    if (status === MovingRequestStatus.COMPLETED) updates.completedAt = new Date();
    const updated = await this.prisma.movingRequest.update({ where: { id }, data: updates });
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'MOVING',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return {
      moving: updated,
      timeline: buildMovingTimeline(updated.status, updated.completedAt),
      paymentReady: status === MovingRequestStatus.COMPLETED,
    };
  }

  async updateStatus(id: string, userId: string, status: MovingRequestStatus) {
    const request = await this.get(id, userId);
    const allowed: Record<MovingRequestStatus, MovingRequestStatus[]> = {
      [MovingRequestStatus.PENDING]: [MovingRequestStatus.ASSIGNED, MovingRequestStatus.CANCELLED],
      [MovingRequestStatus.ASSIGNED]: [MovingRequestStatus.IN_PROGRESS, MovingRequestStatus.CANCELLED],
      [MovingRequestStatus.IN_PROGRESS]: [MovingRequestStatus.COMPLETED],
      [MovingRequestStatus.COMPLETED]: [],
      [MovingRequestStatus.CANCELLED]: [],
    };
    if (!allowed[request.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.MOVING_INVALID_STATUS);
    }
    const updates: Record<string, unknown> = { status };
    if (status === MovingRequestStatus.COMPLETED) updates.completedAt = new Date();
    if (status === MovingRequestStatus.CANCELLED) updates.cancelledAt = new Date();
    const updated = await this.prisma.movingRequest.update({ where: { id }, data: updates });
    const timeline = buildMovingTimeline(updated.status, updated.completedAt);
    return {
      moving: updated,
      timeline,
      paymentReady: status === MovingRequestStatus.COMPLETED,
    };
  }

  async cancel(id: string, userId: string) {
    const request = await this.get(id, userId);
    if (request.status === MovingRequestStatus.COMPLETED || request.status === MovingRequestStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.MOVING_INVALID_STATUS);
    }
    return this.prisma.movingRequest.update({
      where: { id },
      data: { status: MovingRequestStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.movingRequest.findMany({ orderBy: { createdAt: 'desc' }, take });
    return Promise.all(
      rows.map(async (r) => {
        const passenger = await fetchAuthUserBrief(r.userId);
        const driver = r.driverId ? await fetchAuthUserBrief(r.driverId) : null;
        return {
          id: r.id,
          userId: r.userId,
          passengerName: passenger?.name,
          passengerPhone: passenger?.phone,
          driverId: r.driverId,
          driverName: driver?.name,
          driverPhone: driver?.phone,
          status: r.status,
          volumeM3: r.volumeM3,
          pickupAddress: r.pickupAddress,
          dropoffAddress: r.dropoffAddress,
          priceCdf: r.estimatedPriceCdf,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    );
  }

  async adminAssignDriver(id: string, driverId: string) {
    if (!driverId?.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Chauffeur requis.');
    }
    await assertDriverCanReceiveJobs(driverId.trim());
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.status === MovingRequestStatus.COMPLETED || request.status === MovingRequestStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.MOVING_INVALID_STATUS);
    }
    const data: { driverId: string; status?: MovingRequestStatus } = { driverId: driverId.trim() };
    if (request.status === MovingRequestStatus.PENDING) {
      data.status = MovingRequestStatus.ASSIGNED;
    }
    const updated = await this.prisma.movingRequest.update({ where: { id }, data });
    const driver = await fetchAuthUserBrief(updated.driverId!);
    await this.redis.publish(MOVA_EVENTS.SERVICE_ASSIGNED, {
      serviceType: 'MOVING',
      referenceId: updated.id,
      driverId: updated.driverId!,
      passengerId: updated.userId,
      summary: `Déménagement ${updated.pickupAddress} → ${updated.dropoffAddress}`,
      pickupAddress: updated.pickupAddress,
      dropoffAddress: updated.dropoffAddress,
    });
    if (updated.status !== request.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'MOVING',
        referenceId: updated.id,
        userId: updated.userId,
        status: updated.status,
      });
    }
    return {
      id: updated.id,
      driverId: updated.driverId,
      driverName: driver?.name,
      driverPhone: driver?.phone,
      status: updated.status,
    };
  }

  async adminCancel(id: string) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.status === MovingRequestStatus.COMPLETED || request.status === MovingRequestStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.MOVING_INVALID_STATUS);
    }
    return this.prisma.movingRequest.update({ where: { id }, data: { status: MovingRequestStatus.CANCELLED, cancelledAt: new Date() } });
  }

  async adminUpdateStatus(id: string, status: MovingRequestStatus) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updates: Record<string, unknown> = { status };
    if (status === MovingRequestStatus.COMPLETED) updates.completedAt = new Date();
    if (status === MovingRequestStatus.CANCELLED) updates.cancelledAt = new Date();
    const updated = await this.prisma.movingRequest.update({ where: { id }, data: updates });
    if (updated.status !== request.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'MOVING',
        referenceId: updated.id,
        userId: updated.userId,
        status: updated.status,
      });
    }
    return updated;
  }

  async listForDriver(driverId: string) {
    const rows = await this.prisma.movingRequest.findMany({
      where: {
        driverId,
        status: { notIn: [MovingRequestStatus.COMPLETED, MovingRequestStatus.CANCELLED] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: 'MOVING',
        label: 'Déménagement',
        status: r.status,
        pickupAddress: r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        volumeM3: r.volumeM3,
        priceCdf: r.estimatedPriceCdf,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
