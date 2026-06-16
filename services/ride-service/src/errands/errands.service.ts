import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrandOrderStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import { buildErrandTimeline } from '../deliveries/parcel.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CreateErrandOrderDto } from './errands.dto';

const ERRAND_BASE_CDF = 2500;
const ITEM_FEE_CDF = 1500;

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

  private resolvePickup(pickupAddress?: string) {
    const label = pickupAddress?.trim();
    if (label) {
      const coords = addressToCoords(label);
      return { label, lat: coords.lat, lng: coords.lng };
    }
    return { label: DEFAULT_PICKUP.label, lat: DEFAULT_PICKUP.lat, lng: DEFAULT_PICKUP.lng };
  }

  /** Compatibilité mobile: { deliveryAddress, items[], pickupAddress? } */
  async estimateMobile(deliveryAddress: string, items: string[], pickupAddress?: string) {
    const pickup = this.resolvePickup(pickupAddress);
    const dropoff = addressToCoords(deliveryAddress);
    const description = items.length ? items.join(', ') : 'Course';
    const dto: CreateErrandOrderDto = {
      description,
      pickupAddress: pickup.label,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: deliveryAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
    };
    const estimate = await this.estimate(dto);
    const itemsFee = items.length * ITEM_FEE_CDF;
    const estimatedPriceCdf = estimate.estimatedPriceCdf + itemsFee;
    return { ...estimate, estimatedPriceCdf, itemsFeeCdf: itemsFee, currency: 'CDF' };
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

  /** Compatibilité mobile: retourne { errand: { priceCdf, ... } } */
  async createMobile(
    userId: string,
    deliveryAddress: string,
    items: string[],
    deliveryLat?: number,
    deliveryLng?: number,
    pickupAddress?: string,
  ) {
    const pickup = this.resolvePickup(pickupAddress);
    const dropoff = deliveryLat != null && deliveryLng != null ? { lat: deliveryLat, lng: deliveryLng } : addressToCoords(deliveryAddress);
    const description = items.length ? items.join(', ') : 'Course';
    const dto: CreateErrandOrderDto = {
      description,
      pickupAddress: pickup.label,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: deliveryAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
    };
    const { order, estimate } = await this.create(userId, dto);
    const itemsFee = items.length * ITEM_FEE_CDF;
    const priceCdf = estimate.estimatedPriceCdf + itemsFee;
    return {
      errand: {
        id: order.id,
        status: order.status,
        type: 'ERRAND',
        deliveryAddress,
        items,
        priceCdf,
        estimatedPriceCdf: priceCdf,
        createdAt: order.createdAt.toISOString(),
      },
    };
  }

  async list(userId: string) {
    return this.prisma.errandOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listMobile(userId: string) {
    const rows = await this.list(userId);
    return rows.map((o) => ({
      id: o.id,
      type: 'ERRAND',
      deliveryAddress: o.dropoffAddress,
      items: o.description.split(', ').filter(Boolean),
      status: o.status,
      priceCdf: o.estimatedPriceCdf,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async get(id: string, userId: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    const timeline = buildErrandTimeline(order.status, order.completedAt);
    return {
      ...order,
      timeline,
      tracking: timeline,
      paymentReady: order.status === ErrandOrderStatus.COMPLETED,
      priceCdf: order.estimatedPriceCdf,
      currency: 'CDF',
      city: 'Kinshasa',
    };
  }

  async cancel(id: string, userId: string) {
    const order = await this.get(id, userId);
    if (order.status === ErrandOrderStatus.COMPLETED || order.status === ErrandOrderStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    return this.prisma.errandOrder.update({
      where: { id },
      data: { status: ErrandOrderStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  async updateStatus(id: string, userId: string, status: ErrandOrderStatus) {
    const order = await this.get(id, userId);
    const allowed: Record<ErrandOrderStatus, ErrandOrderStatus[]> = {
      [ErrandOrderStatus.PENDING]: [ErrandOrderStatus.ASSIGNED, ErrandOrderStatus.CANCELLED],
      [ErrandOrderStatus.ASSIGNED]: [ErrandOrderStatus.IN_PROGRESS, ErrandOrderStatus.CANCELLED],
      [ErrandOrderStatus.IN_PROGRESS]: [ErrandOrderStatus.COMPLETED],
      [ErrandOrderStatus.COMPLETED]: [],
      [ErrandOrderStatus.CANCELLED]: [],
    };
    if (!allowed[order.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    const updates: Record<string, unknown> = { status };
    if (status === ErrandOrderStatus.COMPLETED) updates.completedAt = new Date();
    if (status === ErrandOrderStatus.CANCELLED) updates.cancelledAt = new Date();
    const updated = await this.prisma.errandOrder.update({ where: { id }, data: updates });
    const timeline = buildErrandTimeline(updated.status, updated.completedAt);
    return {
      order: updated,
      timeline,
      paymentReady: status === ErrandOrderStatus.COMPLETED,
    };
  }
}
