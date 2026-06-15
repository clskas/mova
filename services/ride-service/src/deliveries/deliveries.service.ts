import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, Prisma, SurchargeType, VehicleType, WeightCategory } from '@prisma/client';
import { INTERNAL_API_KEY, MARKET_RDC, MovaErrorCode, MovaHttpException, formatCdf, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { SurchargeService } from '../rides/surcharge.service';
import { CreateFoodDeliveryDto, CreateParcelDeliveryDto } from './deliveries.dto';
import { assertServiceAreaPair } from '../common/address.util';
import {
  buildParcelTimeline,
  detectCommune,
  formatParcelDelivery,
  generateDeliveryPin,
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

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private surcharges: SurchargeService,
  ) {}

  private validateParcelDto(dto: CreateParcelDeliveryDto) {
    assertServiceAreaPair(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
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
    const { pickupArea, dropoffArea, isInterCity } = assertServiceAreaPair(
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
    );
    const weightCategory = this.resolveWeightCategory(dto);
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 20) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin, pickupArea.name);
    const withInterCity = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const multiplier = this.weightMultiplier(weightCategory, dto.weightKg);
    const estimatedPriceCdf = Math.ceil(withInterCity.estimatedFareCdf * multiplier);
    const pickupCommune = detectCommune(dto.pickupLat, dto.pickupLng, dto.pickupAddress);
    const dropoffCommune = detectCommune(dto.dropoffLat, dto.dropoffLng, dto.dropoffAddress);
    return {
      ...withInterCity,
      weightCategory,
      weightKg: dto.weightKg,
      weightMultiplier: multiplier,
      estimatedPriceCdf,
      priceCdf: estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      formattedPrice: formatCdf(estimatedPriceCdf),
      currency: 'CDF',
      city: pickupArea.name,
      pickupCity: pickupArea.name,
      dropoffCity: dropoffArea.name,
      isInterCity,
      pickupCommune,
      dropoffCommune,
      priceBreakdown: {
        baseFareCdf: withInterCity.baseFareCdf,
        distanceFareCdf: withInterCity.distanceFareCdf,
        durationFareCdf: withInterCity.durationFareCdf,
        weightSurchargeCdf: Math.max(0, estimatedPriceCdf - withInterCity.estimatedFareCdf),
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
        deliveryPin: generateDeliveryPin(),
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
    const foodSurcharge = await this.surcharges.get(SurchargeType.DELIVERY_FOOD);
    const itemsSubtotal = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCdf, 0);
    const distanceKm = this.pricing.haversineKm(restaurant.lat, restaurant.lng, dto.deliveryLat, dto.deliveryLng);
    const durationMin = (distanceKm / 20) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.MOTO_TAXI, distanceKm, durationMin);
    const deliveryFeeCdf = Math.max(foodSurcharge.baseFeeCdf || FOOD_DELIVERY_BASE_CDF, Math.ceil(fare.estimatedFareCdf * foodSurcharge.multiplier));
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
        deliveryPin: generateDeliveryPin(),
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
    const express = await this.surcharges.get(SurchargeType.DELIVERY_EXPRESS);
    const estimatedPriceCdf = Math.ceil(parcel.estimatedPriceCdf * express.multiplier + express.baseFeeCdf);
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
        deliveryPin: generateDeliveryPin(),
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
    if (delivery.userId !== userId && delivery.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const courier = delivery.driverId ? await this.fetchCourierProfile(delivery.driverId) : null;
    const formatted = formatParcelDelivery(delivery, courier);
    return {
      delivery: formatted,
      tracking: formatted.timeline,
      courierLocation: formatted.courierLocation,
      courier: formatted.courier,
      etaMinutes: formatted.etaMinutes,
      deliveryPin: formatted.deliveryPin,
      paymentReady: formatted.paymentReady,
    };
  }

  private async fetchUserBrief(userId: string): Promise<{ name?: string; phone?: string } | null> {
    try {
      const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      const user = (await res.json()) as { firstName?: string; lastName?: string; phone?: string };
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      return { name: name || undefined, phone: user.phone };
    } catch {
      return null;
    }
  }

  private async fetchCourierProfile(userId: string) {
    const profile = await this.fetchDriverProfile(userId);
    if (!profile) return null;
    const user = await this.fetchUserBrief(userId);
    return {
      userId,
      name: user?.name ?? `Livreur ${userId.slice(0, 6)}`,
      phone: user?.phone ?? '',
      rating: (profile as { ratingAvg?: number }).ratingAvg ?? 4.5,
      lat: profile.currentLat,
      lng: profile.currentLng,
    };
  }

  async getHistory(userId: string, role?: string) {
    const where = role === 'driver' ? { driverId: userId } : { userId };
    const rows = await this.prisma.delivery.findMany({
      where,
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

  async listRestaurants(deliveryLat?: number, deliveryLng?: number) {
    const rows = await this.prisma.restaurant.findMany({
      where: { isActive: true },
      orderBy: { rating: 'desc' },
      select: { id: true, name: true, cuisine: true, address: true, lat: true, lng: true, rating: true, imageUrl: true, menuItems: true },
    });
    const data = rows.map((r) => {
      let deliveryEtaMin: number | null = null;
      if (deliveryLat != null && deliveryLng != null) {
        const distanceKm = this.pricing.haversineKm(r.lat, r.lng, deliveryLat, deliveryLng);
        const travelMin = Math.ceil((distanceKm / 20) * 60);
        deliveryEtaMin = Math.max(20, travelMin + 15);
      }
      return { ...r, deliveryEtaMin };
    });
    return { data };
  }

  private async fetchDriverProfile(userId: string) {
    try {
      const res = await fetch(serviceUrl('driver', `/internal/drivers/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        isAvailable?: boolean;
        kycStatus?: string;
        currentLat?: number | null;
        currentLng?: number | null;
        ratingAvg?: number;
      };
    } catch {
      return null;
    }
  }

  async getDriverOffers(driverUserId: string) {
    const profile = await this.fetchDriverProfile(driverUserId);
    if (!profile?.isAvailable || profile.kycStatus !== 'APPROVED') {
      return { offers: [] as Record<string, unknown>[] };
    }
    if (profile.currentLat == null || profile.currentLng == null) {
      return { offers: [] as Record<string, unknown>[] };
    }

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        status: DeliveryStatus.PENDING,
        driverId: null,
        type: { in: [DeliveryType.PARCEL, DeliveryType.FOOD, DeliveryType.EXPRESS] },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { restaurant: { select: { id: true, name: true, cuisine: true } } },
    });

    const radiusKm = MARKET_RDC.matching.maxRadiusKm;
    const offers = deliveries
      .map((d) => {
        const pickupLat = d.pickupLat ?? d.deliveryLat ?? 0;
        const pickupLng = d.pickupLng ?? d.deliveryLng ?? 0;
        const distanceKm = this.pricing.haversineKm(profile.currentLat!, profile.currentLng!, pickupLat, pickupLng);
        const formatted = formatParcelDelivery(d as Parameters<typeof formatParcelDelivery>[0]);
        return {
          ...formatted,
          offerType: 'DELIVERY',
          type: d.type,
          restaurantName: d.restaurant?.name,
          distanceKm: Math.round(distanceKm * 100) / 100,
        };
      })
      .filter((o) => o.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return { offers };
  }

  async acceptDelivery(deliveryId: string, driverUserId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    if (delivery.driverId) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Livraison déjà assignée.');
    }
    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { driverId: driverUserId, status: DeliveryStatus.PICKED_UP, pickedUpAt: new Date() },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    await this.prisma.deliveryEvent.create({
      data: { deliveryId, event: 'ASSIGNED', metadata: { driverUserId } },
    });
    const formatted = formatParcelDelivery(updated);
    return { delivery: formatted, success: true };
  }

  async updateStatus(id: string, status: DeliveryStatus, userId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.userId !== userId && delivery.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
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

  async getDeliveryAdmin(id: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const formatted = formatParcelDelivery(delivery);
    return {
      id: delivery.id,
      type: delivery.type,
      status: delivery.status,
      userId: delivery.userId,
      pickupAddress: delivery.pickupAddress,
      dropoffAddress: delivery.dropoffAddress ?? delivery.deliveryAddress,
      restaurantName: delivery.restaurant?.name,
      priceCdf: delivery.estimatedPriceCdf,
      createdAt: delivery.createdAt.toISOString(),
      events: delivery.events,
      timeline: formatted.timeline,
    };
  }

  async updateStatusAdmin(id: string, status: DeliveryStatus) {
    return this.updateStatus(id, status, 'admin');
  }

  async deleteRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    return this.prisma.restaurant.update({ where: { id }, data: { isActive: false } });
  }

  async adminCancelDelivery(id: string, reason?: string) {
    return this.updateStatusAdmin(id, DeliveryStatus.CANCELLED);
  }
}
