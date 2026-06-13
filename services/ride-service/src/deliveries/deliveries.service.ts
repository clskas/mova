import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, Prisma, VehicleType, WeightCategory } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CreateFoodDeliveryDto, CreateParcelDeliveryDto } from './deliveries.dto';
import {
  assertKinshasaCoords,
  buildParcelTimeline,
  detectCommune,
  formatParcelDelivery,
} from './parcel.util';

const WEIGHT_MULTIPLIERS: Record<WeightCategory, number> = {
  [WeightCategory.DOCUMENTS]: 1.0,
  [WeightCategory.SMALL]: 1.1,
  [WeightCategory.MEDIUM]: 1.25,
  [WeightCategory.LARGE]: 1.5,
};

const WEIGHT_KG_MULTIPLIERS: { maxKg: number; category: WeightCategory; multiplier: number }[] = [
  { maxKg: 0.5, category: WeightCategory.DOCUMENTS, multiplier: 1.0 },
  { maxKg: 1, category: WeightCategory.SMALL, multiplier: 1.1 },
  { maxKg: 5, category: WeightCategory.MEDIUM, multiplier: 1.25 },
  { maxKg: 50, category: WeightCategory.LARGE, multiplier: 1.5 },
];

const FOOD_DELIVERY_BASE_CDF = 3000;
const EXPRESS_MULTIPLIER = 1.35;

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService, private pricing: PricingService) {}

  private validateParcelDto(dto: CreateParcelDeliveryDto) {
    assertKinshasaCoords(dto.pickupLat, dto.pickupLng);
    assertKinshasaCoords(dto.dropoffLat, dto.dropoffLng);
    if (!dto.pickupAddress?.trim() || !dto.dropoffAddress?.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Les adresses d\'enlèvement et de livraison sont obligatoires.');
    }
  }

  private resolveWeightCategory(dto: CreateParcelDeliveryDto): WeightCategory {
    if (dto.weightKg != null) {
      const band = WEIGHT_KG_MULTIPLIERS.find((b) => dto.weightKg! <= b.maxKg);
      return band?.category ?? WeightCategory.LARGE;
    }
    return dto.weightCategory;
  }

  private weightMultiplier(category: WeightCategory, weightKg?: number): number {
    const base = WEIGHT_MULTIPLIERS[category];
    if (weightKg != null && weightKg > 5) return base * 1.1;
    return base;
  }

  async estimateParcel(dto: CreateParcelDeliveryDto) {
    this.validateParcelDto(dto);
    const weightCategory = this.resolveWeightCategory(dto);
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 20) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin);
    const multiplier = this.weightMultiplier(weightCategory, dto.weightKg);
    const estimatedPriceCdf = Math.ceil(fare.estimatedFareCdf * multiplier);
    const pickupCommune = detectCommune(dto.pickupLat, dto.pickupLng, dto.pickupAddress);
    const dropoffCommune = detectCommune(dto.dropoffLat, dto.dropoffLng, dto.dropoffAddress);
    return {
      ...fare,
      weightCategory,
      weightKg: dto.weightKg,
      weightMultiplier: multiplier,
      estimatedPriceCdf,
      priceCdf: estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      formattedPrice: formatCdf(estimatedPriceCdf),
      currency: 'CDF',
      city: 'Kinshasa',
      pickupCommune,
      dropoffCommune,
      priceBreakdown: {
        baseFareCdf: fare.baseFareCdf,
        distanceFareCdf: fare.distanceFareCdf,
        durationFareCdf: fare.durationFareCdf,
        weightSurchargeCdf: Math.max(0, estimatedPriceCdf - fare.estimatedFareCdf),
        totalCdf: estimatedPriceCdf,
      },
      distanceKm,
      durationMin,
    };
  }

  async createParcel(userId: string, dto: CreateParcelDeliveryDto) {
    const estimate = await this.estimateParcel(dto);
    const weightCategory = this.resolveWeightCategory(dto);
    const delivery = await this.prisma.delivery.create({
      data: {
        userId,
        type: DeliveryType.PARCEL,
        status: DeliveryStatus.PENDING,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress.trim(),
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress.trim(),
        photoUrl: dto.photoUrl,
        weightCategory,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { events: true },
    });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, event: 'CREATED' } });
    const formatted = formatParcelDelivery({ ...delivery, events: [{ id: '1', deliveryId: delivery.id, event: 'CREATED', metadata: null, createdAt: new Date() }] });
    return { delivery: formatted, estimate };
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
    const withEvents = { ...delivery, events: [{ id: '1', deliveryId: delivery.id, event: 'ORDER_PLACED', metadata: null, createdAt: new Date() }] };
    return { delivery: formatParcelDelivery(withEvents), estimate };
  }

  async estimateExpress(dto: CreateParcelDeliveryDto) {
    const parcel = await this.estimateParcel(dto);
    const estimatedPriceCdf = Math.ceil(parcel.estimatedPriceCdf * EXPRESS_MULTIPLIER);
    return {
      ...parcel,
      type: 'EXPRESS',
      estimatedPriceCdf,
      priceCdf: estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      formattedPrice: formatCdf(estimatedPriceCdf),
      expressSurchargeCdf: estimatedPriceCdf - parcel.estimatedPriceCdf,
      etaMin: Math.max(15, Math.ceil((parcel.durationMin ?? 30) * 0.6)),
    };
  }

  async createExpress(userId: string, dto: CreateParcelDeliveryDto) {
    const estimate = await this.estimateExpress(dto);
    const weightCategory = this.resolveWeightCategory(dto);
    const delivery = await this.prisma.delivery.create({
      data: {
        userId,
        type: DeliveryType.EXPRESS,
        status: DeliveryStatus.PENDING,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress.trim(),
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress.trim(),
        photoUrl: dto.photoUrl,
        weightCategory,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { events: true },
    });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, event: 'EXPRESS_CREATED' } });
    const formatted = formatParcelDelivery({ ...delivery, events: [{ id: '1', deliveryId: delivery.id, event: 'EXPRESS_CREATED', metadata: null, createdAt: new Date() }] });
    return { delivery: formatted, estimate };
  }

  async cancelDelivery(id: string, userId: string) {
    return this.updateStatus(id, DeliveryStatus.CANCELLED, userId);
  }

  async getRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant || !restaurant.isActive) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    return {
      ...restaurant,
      menu: restaurant.menuItems ?? [],
    };
  }

  async getDelivery(id: string, userId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    const formatted = formatParcelDelivery(delivery);
    return {
      delivery: formatted,
      tracking: formatted.timeline,
      courierLocation: formatted.courierLocation,
      paymentReady: formatted.paymentReady,
    };
  }

  async getHistory(userId: string) {
    const rows = await this.prisma.delivery.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { restaurant: { select: { id: true, name: true, cuisine: true } }, events: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      data: rows.map((d) => ({
        ...formatParcelDelivery(d),
        restaurantName: d.restaurant?.name,
      })),
    };
  }

  async getExpressHistory(userId: string) {
    const rows = await this.prisma.delivery.findMany({
      where: { userId, type: DeliveryType.EXPRESS },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    return { data: rows.map((d) => formatParcelDelivery(d)) };
  }

  async listRestaurants() {
    const rows = await this.prisma.restaurant.findMany({
      where: { isActive: true },
      orderBy: { rating: 'desc' },
      select: { id: true, name: true, cuisine: true, address: true, lat: true, lng: true, rating: true, imageUrl: true, menuItems: true },
    });
    return { data: rows };
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
    const updated = await this.prisma.delivery.update({ where: { id }, data: updates, include: { events: { orderBy: { createdAt: 'asc' } }, restaurant: true } });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: id, event: status, metadata: { updatedBy: userId } } });
    const formatted = formatParcelDelivery(updated);
    return { delivery: formatted, paymentReady: status === DeliveryStatus.DELIVERED };
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

  async listRestaurantsAdmin() {
    return this.prisma.restaurant.findMany({ orderBy: { name: 'asc' } });
  }

  async upsertRestaurant(id: string | null, data: Record<string, unknown>) {
    if (id) return this.prisma.restaurant.update({ where: { id }, data: data as never });
    return this.prisma.restaurant.create({ data: data as never });
  }
}
