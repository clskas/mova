import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrandOrderStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CreateErrandOrderDto } from './errands.dto';

const ERRAND_BASE_CDF = 2500;

@Injectable()
export class ErrandsService {
  constructor(private prisma: PrismaService, private pricing: PricingService) {}

  async estimate(dto: CreateErrandOrderDto) {
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 18) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.MOTO_TAXI, distanceKm, durationMin);
    const estimatedPriceCdf = Math.ceil(fare.estimatedFareCdf + ERRAND_BASE_CDF);
    return {
      estimatedPriceCdf,
      formatted: `${estimatedPriceCdf.toLocaleString('fr-CD')} FC`,
      distanceKm,
      durationMin,
      errandFeeCdf: ERRAND_BASE_CDF,
    };
  }

  async create(userId: string, dto: CreateErrandOrderDto) {
    const estimate = await this.estimate(dto);
    const order = await this.prisma.errandOrder.create({
      data: {
        userId,
        status: ErrandOrderStatus.PENDING,
        description: dto.description,
        pickupAddress: dto.pickupAddress,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
    });
    return { order, estimate };
  }

  async list(userId: string) {
    return this.prisma.errandOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async get(id: string, userId: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return order;
  }
}
