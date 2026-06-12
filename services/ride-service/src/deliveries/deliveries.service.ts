import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, Prisma, VehicleType, WeightCategory } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CreateFoodDeliveryDto, CreateParcelDeliveryDto } from './deliveries.dto';

const WEIGHT_MULTIPLIERS: Record<WeightCategory, number> = {
  [WeightCategory.DOCUMENTS]: 1.0,
  [WeightCategory.SMALL]: 1.1,
  [WeightCategory.MEDIUM]: 1.25,
  [WeightCategory.LARGE]: 1.5,
};

const FOOD_DELIVERY_BASE_CDF = 3000;

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService, private pricing: PricingService) {}

  async estimateParcel(dto: CreateParcelDeliveryDto) {
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 20) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin);
    const multiplier = WEIGHT_MULTIPLIERS[dto.weightCategory];
    const estimatedPriceCdf = Math.ceil(fare.estimatedFareCdf * multiplier);
    return {
      ...fare,
      weightCategory: dto.weightCategory,
      weightMultiplier: multiplier,
      estimatedPriceCdf,
      formatted: `${estimatedPriceCdf.toLocaleString('fr-CD')} FC`,
      distanceKm,
      durationMin,
    };
  }

  async createParcel(userId: string, dto: CreateParcelDeliveryDto) {
    const estimate = await this.estimateParcel(dto);
    const delivery = await this.prisma.delivery.create({
      data: {
        userId,
        type: DeliveryType.PARCEL,
        status: DeliveryStatus.PENDING,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress,
        photoUrl: dto.photoUrl,
        weightCategory: dto.weightCategory,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { events: true },
    });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, event: 'CREATED' } });
    return { delivery, estimate };
  }

  async estimateFood(dto: CreateFoodDeliveryDto) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: dto.restaurantId } });
    if (!restaurant || !restaurant.isActive) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    const itemsSubtotal = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCdf, 0);
    const distanceKm = this.pricing.haversineKm(restaurant.lat, restaurant.lng, dto.deliveryLat, dto.deliveryLng);
    const durationMin = (distanceKm / 20) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.MOTO_TAXI, distanceKm, durationMin);
    const deliveryFeeCdf = Math.max(FOOD_DELIVERY_BASE_CDF, fare.estimatedFareCdf);
    const estimatedPriceCdf = itemsSubtotal + deliveryFeeCdf;
    return {
      restaurant: { id: restaurant.id, name: restaurant.name },
      itemsSubtotalCdf: itemsSubtotal,
      deliveryFeeCdf,
      estimatedPriceCdf,
      formatted: `${estimatedPriceCdf.toLocaleString('fr-CD')} FC`,
      distanceKm,
      durationMin,
    };
  }

  async createFood(userId: string, dto: CreateFoodDeliveryDto) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: dto.restaurantId } });
    if (!restaurant || !restaurant.isActive) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!dto.items.length) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    const estimate = await this.estimateFood(dto);
    const delivery = await this.prisma.delivery.create({
      data: {
        userId,
        type: DeliveryType.FOOD,
        status: DeliveryStatus.PENDING,
        restaurantId: dto.restaurantId,
        items: dto.items as unknown as Prisma.InputJsonValue,
        deliveryAddress: dto.deliveryAddress,
        deliveryLat: dto.deliveryLat,
        deliveryLng: dto.deliveryLng,
        pickupLat: restaurant.lat,
        pickupLng: restaurant.lng,
        pickupAddress: restaurant.address,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { restaurant: true, events: true },
    });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, event: 'ORDER_PLACED', metadata: { items: dto.items } as unknown as Prisma.InputJsonValue } });
    return { delivery, estimate };
  }

  async getDelivery(id: string, userId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return delivery;
  }

  async getHistory(userId: string) {
    return this.prisma.delivery.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { restaurant: { select: { id: true, name: true, cuisine: true } } },
    });
  }

  async listRestaurants() {
    return this.prisma.restaurant.findMany({
      where: { isActive: true },
      orderBy: { rating: 'desc' },
      select: { id: true, name: true, cuisine: true, address: true, lat: true, lng: true, rating: true, imageUrl: true, menuItems: true },
    });
  }

  async updateStatus(id: string, status: DeliveryStatus, userId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const allowed: Record<DeliveryStatus, DeliveryStatus[]> = {
      [DeliveryStatus.PENDING]: [DeliveryStatus.PICKED_UP, DeliveryStatus.CANCELLED],
      [DeliveryStatus.PICKED_UP]: [DeliveryStatus.IN_TRANSIT, DeliveryStatus.CANCELLED],
      [DeliveryStatus.IN_TRANSIT]: [DeliveryStatus.DELIVERED],
      [DeliveryStatus.DELIVERED]: [],
      [DeliveryStatus.CANCELLED]: [],
    };
    if (!allowed[delivery.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    const updates: Record<string, unknown> = { status };
    if (status === DeliveryStatus.PICKED_UP) updates.pickedUpAt = new Date();
    if (status === DeliveryStatus.DELIVERED) updates.deliveredAt = new Date();
    if (status === DeliveryStatus.CANCELLED) updates.cancelledAt = new Date();
    const updated = await this.prisma.delivery.update({ where: { id }, data: updates });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: id, event: status, metadata: { updatedBy: userId } } });
    return updated;
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.delivery.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { restaurant: { select: { name: true } } },
    });
    return rows.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      pickupAddress: d.pickupAddress,
      dropoffAddress: d.dropoffAddress ?? d.deliveryAddress,
      restaurantName: d.restaurant?.name,
      priceCdf: d.estimatedPriceCdf,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}
