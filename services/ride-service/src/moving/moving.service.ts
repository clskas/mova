import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionServiceType, MovingRequestStatus, MovingVehicleCategory, SurchargeType, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, MOVA_EVENTS, canCancelMoving, estimateTripDurationMin, formatCdf } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { buildMovingTimeline } from '../deliveries/parcel.util';
import { assertServiceAreaPair } from '../common/address.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { fetchServicePaymentStatus } from '../common/payment-status.util';
import { assertDriverCanReceiveJobs, assertDriverEligibleForMoving } from '../common/driver-eligibility.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CommissionService } from '../rides/commission.service';
import { SurchargeService } from '../rides/surcharge.service';
import { TripShareService } from '../share/trip-share.service';
import { CreateMovingDto, EstimateMovingDto } from './moving.dto';
import { applyPromoCode } from '../common/promo-apply.util';
import { PromoService } from '../rides/surcharge.service';
import { RoutingService } from '../geo/routing.service';
import { MovingVehiclePricingService } from './moving-vehicle-pricing.service';
import { PlatformConfigService } from '../platform/platform-config.service';

@Injectable()
export class MovingService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private surcharges: SurchargeService,
    private redis: RedisService,
    private tripShare: TripShareService,
    private promo: PromoService,
    private routing: RoutingService,
    private commission: CommissionService,
    private movingVehiclePricing: MovingVehiclePricingService,
    private platformConfig: PlatformConfigService,
  ) {}

  private validateCoords(dto: EstimateMovingDto) {
    assertServiceAreaPair(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
  }

  private async vehicleCategoryMultiplier(category: MovingVehicleCategory): Promise<number> {
    return this.movingVehiclePricing.getMultiplier(category);
  }

  private async vehicleCategoryLabel(category: MovingVehicleCategory): Promise<string> {
    return this.movingVehiclePricing.getLabel(category);
  }

  async estimate(dto: EstimateMovingDto, redeemPromo = false) {
    const { pickupArea, dropoffArea, isInterCity } = assertServiceAreaPair(
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
    );
    const moving = await this.surcharges.get(SurchargeType.MOVING);
    const route = await this.routing.resolveRoadDistance(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const distanceKm = route.distanceKm;
    const durationMin = route.durationMin ?? estimateTripDurationMin(distanceKm, this.platformConfig.get().trip.averageSpeedKmh.moving);
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin, pickupArea.name);
    const withInterCity = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const perM3 = moving.perUnitCdf ?? 8000;
    const volumeFee = Math.ceil(dto.volumeM3 * perM3);
    const vehicleMultiplier = await this.vehicleCategoryMultiplier(dto.vehicleCategory);
    const beforePromo = Math.ceil(
      (withInterCity.estimatedFareCdf * moving.multiplier + moving.baseFeeCdf + volumeFee) * vehicleMultiplier,
    );
    const promoApplied = await applyPromoCode(this.promo, beforePromo, dto.promoCode, redeemPromo, {
      context: { serviceType: 'MOVING' },
    });
    const estimatedPriceCdf = promoApplied.estimatedPriceCdf;
    const transportBeforeVehicle = Math.ceil(
      withInterCity.estimatedFareCdf * moving.multiplier + moving.baseFeeCdf,
    );
    const beforeVehicle = transportBeforeVehicle + volumeFee;
    return {
      estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      currency: 'CDF',
      city: pickupArea.name,
      pickupCity: pickupArea.name,
      dropoffCity: dropoffArea.name,
      isInterCity,
      volumeM3: dto.volumeM3,
      vehicleCategory: dto.vehicleCategory,
      vehicleCategoryLabel: await this.vehicleCategoryLabel(dto.vehicleCategory),
      volumeFeeCdf: volumeFee,
      transportFareCdf: transportBeforeVehicle,
      serviceBaseFeeCdf: moving.baseFeeCdf,
      vehicleSurchargeCdf: Math.max(0, beforePromo - beforeVehicle),
      passengerTotalCdf: estimatedPriceCdf,
      priceBreakdown: {
        transportFareCdf: transportBeforeVehicle,
        volumeFeeCdf: volumeFee,
        baseFareCdf: moving.baseFeeCdf,
        weightSurchargeCdf: Math.max(0, beforePromo - beforeVehicle),
        totalCdf: estimatedPriceCdf,
      },
      distanceKm,
      durationMin,
    };
  }

  async create(userId: string, dto: CreateMovingDto) {
    const estimate = await this.estimate(dto, true);
    const request = await this.prisma.movingRequest.create({
      data: {
        userId,
        status: MovingRequestStatus.PENDING,
        volumeM3: dto.volumeM3,
        vehicleCategory: dto.vehicleCategory,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress.trim(),
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress.trim(),
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        promoCode: estimate.promoCode,
        discountCdf: estimate.discountCdf || undefined,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
        photoUrls: dto.photoUrls?.length ? dto.photoUrls : undefined,
        itemsNotes: dto.itemsNotes?.trim() || undefined,
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

  private async buildMovingPricingFields(
    request: {
      driverId?: string | null;
      estimatedPriceCdf: number;
      volumeM3: number;
      vehicleCategory?: MovingVehicleCategory | null;
      discountCdf?: number | null;
    },
    viewerUserId?: string,
  ) {
    const movingSurcharge = await this.surcharges.get(SurchargeType.MOVING);
    const perM3 = movingSurcharge.perUnitCdf ?? 8000;
    const volumeFeeCdf = Math.ceil(request.volumeM3 * perM3);
    const passengerTotalCdf = request.estimatedPriceCdf;
    const fields: Record<string, unknown> = {
      type: 'MOVING',
      passengerTotalCdf,
      volumeFeeCdf,
      serviceBaseFeeCdf: movingSurcharge.baseFeeCdf,
      transportFareCdf: Math.max(
        0,
        passengerTotalCdf + (request.discountCdf ?? 0) - volumeFeeCdf - movingSurcharge.baseFeeCdf,
      ),
      discountCdf: request.discountCdf ?? 0,
      priceBreakdown: {
        transportFareCdf: Math.max(
          0,
          passengerTotalCdf + (request.discountCdf ?? 0) - volumeFeeCdf - movingSurcharge.baseFeeCdf,
        ),
        volumeFeeCdf,
        baseFareCdf: movingSurcharge.baseFeeCdf,
        totalCdf: passengerTotalCdf,
      },
    };
    if (viewerUserId && request.driverId === viewerUserId) {
      const rule = await this.commission.get(CommissionServiceType.MOVING);
      fields.driverGrossCdf = passengerTotalCdf;
      fields.driverNetCdf = Math.round(
        this.commission.splitGross(passengerTotalCdf, rule.platformPercent).driverNetCdf,
      );
    }
    return fields;
  }

  private async formatMovingDetail(
    request: {
      id: string;
      status: MovingRequestStatus;
      completedAt: Date | null;
      estimatedPriceCdf: number;
      photoUrls: unknown;
      itemsNotes?: string | null;
      completionPin?: string | null;
      driverId?: string | null;
      volumeM3: number;
      vehicleCategory?: MovingVehicleCategory | null;
      discountCdf?: number | null;
      [key: string]: unknown;
    },
    viewerUserId?: string,
  ) {
    const timeline = buildMovingTimeline(request.status, request.completedAt);
    const photoUrls = Array.isArray(request.photoUrls) ? (request.photoUrls as string[]) : [];
    const vehicleCategory = request.vehicleCategory as MovingVehicleCategory | undefined;
    const payment =
      request.status === MovingRequestStatus.COMPLETED
        ? await fetchServicePaymentStatus('MOVING', request.id)
        : { isPaid: false, paymentStatus: null };
    const isPaid = payment.isPaid;
    const pricing = await this.buildMovingPricingFields(request, viewerUserId);
    return {
      ...request,
      ...pricing,
      photoUrls,
      vehicleCategoryLabel: vehicleCategory ? await this.vehicleCategoryLabel(vehicleCategory) : undefined,
      timeline,
      tracking: timeline,
      paymentReady: request.status === MovingRequestStatus.COMPLETED && !isPaid,
      isPaid,
      paymentReferenceId: request.id,
      paymentStatus: payment.paymentStatus,
      completionPin: request.completionPin ?? undefined,
      itemsNotes: request.itemsNotes ?? undefined,
      priceCdf: request.estimatedPriceCdf,
      formattedPrice: formatCdf(request.estimatedPriceCdf),
      currency: 'CDF',
      city: 'Kinshasa',
      ...canCancelMoving({ status: request.status }),
    };
  }

  async get(id: string, userId: string) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return await this.formatMovingDetail(request, userId);
  }

  async getForParticipant(id: string, userId: string) {
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (request.userId !== userId && request.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    return await this.formatMovingDetail(request, userId);
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
    if (status === MovingRequestStatus.COMPLETED) {
      updates.completedAt = new Date();
      if (!request.completionPin) {
        updates.completionPin = this.tripShare.generateCompletionPin();
      }
    }
    const updated = await this.prisma.movingRequest.update({ where: { id }, data: updates });
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'MOVING',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return {
      moving: await this.formatMovingDetail(updated, driverId),
      timeline: buildMovingTimeline(updated.status, updated.completedAt),
      paymentReady: status === MovingRequestStatus.COMPLETED,
    };
  }

  async updateStatus(id: string, userId: string, status: MovingRequestStatus) {
    await this.get(id, userId);
    // Passager : annulation uniquement (statuts gérés par admin/chauffeur).
    if (status !== MovingRequestStatus.CANCELLED) {
      throw new MovaHttpException(
        MovaErrorCode.MOVING_INVALID_STATUS,
        HttpStatus.FORBIDDEN,
        'Seul l\'annulation est autorisée depuis l\'application passager.',
      );
    }
    return this.cancel(id, userId);
  }

  async cancel(id: string, userId: string) {
    const request = await this.get(id, userId);
    const cancelEligibility = canCancelMoving({ status: request.status });
    if (!cancelEligibility.canCancel) {
      throw new MovaHttpException(
        MovaErrorCode.MOVING_INVALID_STATUS,
        undefined,
        cancelEligibility.cancelBlockReason,
      );
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
          vehicleCategory: r.vehicleCategory,
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
    const request = await this.prisma.movingRequest.findUnique({ where: { id } });
    if (!request) throw new MovaHttpException(MovaErrorCode.MOVING_NOT_FOUND, HttpStatus.NOT_FOUND);
    await assertDriverEligibleForMoving(driverId.trim(), request.vehicleCategory);
    if (request.status === MovingRequestStatus.COMPLETED || request.status === MovingRequestStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.MOVING_INVALID_STATUS);
    }
    const data: { driverId: string; status?: MovingRequestStatus; completionPin?: string } = {
      driverId: driverId.trim(),
      completionPin: request.completionPin ?? this.tripShare.generateCompletionPin(),
    };
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
      data: await Promise.all(
        rows.map(async (r) => {
          const pricing = await this.buildMovingPricingFields(r, driverId);
          return {
            id: r.id,
            type: 'MOVING',
            label: 'Déménagement',
            status: r.status,
            pickupAddress: r.pickupAddress,
            dropoffAddress: r.dropoffAddress,
            volumeM3: r.volumeM3,
            vehicleCategory: r.vehicleCategory,
            priceCdf: r.estimatedPriceCdf,
            createdAt: r.createdAt.toISOString(),
            ...pricing,
          };
        }),
      ),
    };
  }
}
