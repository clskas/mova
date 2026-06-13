import { HttpStatus, Injectable } from '@nestjs/common';
import { MovingRequestStatus, SurchargeType, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { assertServiceAreaCoords, buildMovingTimeline } from '../deliveries/parcel.util';
import { assertSameServiceArea } from '../common/address.util';
import { findServiceAreaByCoords, MARKET_RDC } from '@mova/shared';
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
  ) {}

  private validateCoords(dto: EstimateMovingDto) {
    assertServiceAreaCoords(dto.pickupLat, dto.pickupLng);
    assertServiceAreaCoords(dto.dropoffLat, dto.dropoffLng);
    assertSameServiceArea(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
  }

  async estimate(dto: EstimateMovingDto) {
    this.validateCoords(dto);
    const moving = await this.surcharges.get(SurchargeType.MOVING);
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 15) * 60;
    const city = findServiceAreaByCoords(dto.pickupLat, dto.pickupLng)?.name ?? MARKET_RDC.defaultCity;
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin, city);
    const perM3 = moving.perUnitCdf ?? 8000;
    const volumeFee = Math.ceil(dto.volumeM3 * perM3);
    const estimatedPriceCdf = Math.ceil(fare.estimatedFareCdf * moving.multiplier + moving.baseFeeCdf + volumeFee);
    return {
      estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      currency: 'CDF',
      city: 'Kinshasa',
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

  async get(id: string, userId: string) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    const timeline = buildMovingTimeline(request.status, request.completedAt);
    return {
      ...request,
      timeline,
      tracking: timeline,
      paymentReady: request.status === MovingRequestStatus.COMPLETED,
      priceCdf: request.estimatedPriceCdf,
      formattedPrice: formatCdf(request.estimatedPriceCdf),
      currency: 'CDF',
      city: 'Kinshasa',
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
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      status: r.status,
      volumeM3: r.volumeM3,
      pickupAddress: r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      priceCdf: r.estimatedPriceCdf,
      createdAt: r.createdAt.toISOString(),
    }));
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
    return this.prisma.movingRequest.update({ where: { id }, data: updates });
  }
}
