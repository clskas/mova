import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, Prisma, SurchargeType, VehicleType, WeightCategory } from '@prisma/client';
import { INTERNAL_API_KEY, MARKET_RDC, MOVA_EVENTS, MovaErrorCode, MovaHttpException, formatCdf, resolveCityFromCoords, serviceUrl } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { PromoService, SurchargeService } from '../rides/surcharge.service';
import { CreateFoodDeliveryDto, CreateFoodMultiDeliveryDto, CreateParcelDeliveryDto, RateDeliveryDto } from './deliveries.dto';
import { assertServiceAreaPair } from '../common/address.util';
import { tripDistanceKm } from '../common/geo.util';
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

type MenuSize = { label?: string; name?: string; priceCdf?: number; unitPriceCdf?: number };
type MenuOption = { label?: string; name?: string; priceCdf?: number; unitPriceCdf?: number };
type MenuItem = {
  name?: string;
  unitPriceCdf?: number;
  priceCdf?: number;
  sizes?: MenuSize[];
  options?: MenuOption[];
};

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private surcharges: SurchargeService,
    private promo: PromoService,
    private redis: RedisService,
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

  private async applyFoodPromo(totalCdf: number, promoCode?: string, redeem = false) {
    if (!promoCode?.trim()) {
      return { estimatedPriceCdf: totalCdf, discountCdf: 0, promoCode: null as string | null };
    }
    const promoRow = redeem ? await this.promo.redeem(promoCode) : await this.promo.peek(promoCode);
    const estimatedPriceCdf = this.promo.applyDiscount(totalCdf, promoRow);
    return { estimatedPriceCdf, discountCdf: totalCdf - estimatedPriceCdf, promoCode: promoRow.code };
  }

  async validatePromoCode(code: string) {
    const promo = await this.promo.peek(code);
    return {
      code: promo.code,
      discountPercent: promo.discountPercent,
      discountCdf: promo.discountCdf,
      validUntil: promo.validUntil?.toISOString() ?? null,
    };
  }

  private computeFoodItemUnitPriceCdf(menuItem: MenuItem, size?: string, options?: string[]): number {
    const base = menuItem.unitPriceCdf ?? menuItem.priceCdf ?? 0;
    let total = base;

    if (size != null && size.trim().length > 0 && Array.isArray(menuItem.sizes)) {
      const s = menuItem.sizes.find((x) => (x.label ?? x.name)?.toString() === size);
      const sPrice = s?.priceCdf ?? s?.unitPriceCdf;
      if (sPrice != null && sPrice > 0) total = sPrice;
    }

    if (options != null && options.length > 0 && Array.isArray(menuItem.options)) {
      for (const opt of options) {
        const o = menuItem.options.find((x) => (x.label ?? x.name)?.toString() === opt);
        const oPrice = o?.priceCdf ?? o?.unitPriceCdf ?? 0;
        total += oPrice;
      }
    }
    return Math.max(0, total);
  }

  private resolveFoodItemsSubtotalCdf(restaurantMenu: unknown, items: CreateFoodDeliveryDto['items']) {
    const menu = (Array.isArray(restaurantMenu) ? restaurantMenu : []) as MenuItem[];
    let subtotal = 0;
    const normalized = items.map((it) => {
      const menuItem = menu.find((m) => (m.name ?? '').toString() === it.name);
      if (!menuItem) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, `Plat introuvable: ${it.name}`);
      }
      const unitPriceCdf = this.computeFoodItemUnitPriceCdf(menuItem, it.size, it.options);
      subtotal += unitPriceCdf * it.quantity;
      return { ...it, unitPriceCdf };
    });
    return { subtotalCdf: subtotal, normalizedItems: normalized };
  }

  async estimateFood(dto: CreateFoodDeliveryDto) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: dto.restaurantId } });
    if (!restaurant || !restaurant.isActive) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!restaurant.isAcceptingOrders) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ce restaurant n\'accepte pas de commandes pour le moment.');
    }
    const foodSurcharge = await this.surcharges.get(SurchargeType.DELIVERY_FOOD);
    const { subtotalCdf: itemsSubtotal } = this.resolveFoodItemsSubtotalCdf(restaurant.menuItems, dto.items);
    const distanceKm = this.pricing.haversineKm(restaurant.lat, restaurant.lng, dto.deliveryLat, dto.deliveryLng);
    const durationMin = (distanceKm / 20) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.MOTO_TAXI, distanceKm, durationMin);
    const deliveryFeeCdf = Math.max(foodSurcharge.baseFeeCdf || FOOD_DELIVERY_BASE_CDF, Math.ceil(fare.estimatedFareCdf * foodSurcharge.multiplier));
    const subtotalWithDelivery = itemsSubtotal + deliveryFeeCdf;
    const promoApplied = await this.applyFoodPromo(subtotalWithDelivery, dto.promoCode, false);
    return {
      restaurant: { id: restaurant.id, name: restaurant.name },
      itemsSubtotalCdf: itemsSubtotal,
      deliveryFeeCdf,
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      estimatedPriceCdf: promoApplied.estimatedPriceCdf,
      formatted: `${promoApplied.estimatedPriceCdf.toLocaleString('fr-CD')} FC`,
      distanceKm,
      durationMin,
    };
  }

  async createFood(userId: string, dto: CreateFoodDeliveryDto) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: dto.restaurantId } });
    if (!restaurant || !restaurant.isActive) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!restaurant.isAcceptingOrders) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ce restaurant n\'accepte pas de commandes pour le moment.');
    }
    if (!dto.items.length) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    const { subtotalCdf, normalizedItems } = this.resolveFoodItemsSubtotalCdf(restaurant.menuItems, dto.items);
    const estimate = await this.estimateFood({ ...dto, items: normalizedItems });
    const promoApplied = await this.applyFoodPromo(subtotalCdf + estimate.deliveryFeeCdf, dto.promoCode, true);
    const delivery = await this.prisma.delivery.create({
      data: {
        userId,
        type: DeliveryType.FOOD,
        status: DeliveryStatus.PENDING,
        deliveryPin: generateDeliveryPin(),
        restaurantId: dto.restaurantId,
        items: normalizedItems as unknown as Prisma.InputJsonValue,
        deliveryAddress: dto.deliveryAddress,
        deliveryLat: dto.deliveryLat,
        deliveryLng: dto.deliveryLng,
        pickupLat: restaurant.lat,
        pickupLng: restaurant.lng,
        pickupAddress: restaurant.address,
        estimatedPriceCdf: promoApplied.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { restaurant: true, events: true },
    });
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        event: 'ORDER_PLACED',
        metadata: { items: normalizedItems, promoCode: promoApplied.promoCode, discountCdf: promoApplied.discountCdf } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.redis.publish(MOVA_EVENTS.DELIVERY_CREATED, {
      deliveryId: delivery.id,
      userId,
      type: delivery.type,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantOwnerUserId: restaurant.ownerUserId ?? undefined,
      estimatedPriceCdf: delivery.estimatedPriceCdf,
    });
    const withEvents = { ...delivery, events: [{ id: '1', deliveryId: delivery.id, event: 'ORDER_PLACED', metadata: null, createdAt: new Date() }] };
    return { delivery: formatParcelDelivery(withEvents), estimate: { ...estimate, estimatedPriceCdf: promoApplied.estimatedPriceCdf, discountCdf: promoApplied.discountCdf } };
  }

  async estimateFoodMulti(dto: CreateFoodMultiDeliveryDto) {
    if (!dto.orders?.length) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ajoutez au moins un restaurant.');

    const restaurants = await this.prisma.restaurant.findMany({
      where: { id: { in: dto.orders.map((o) => o.restaurantId) }, isActive: true },
    });
    if (restaurants.length !== dto.orders.length) {
      throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    let itemsSubtotalCdf = 0;
    let maxDistanceKm = 0;
    let maxDurationMin = 0;

    for (const order of dto.orders) {
      const r = restaurants.find((x) => x.id === order.restaurantId)!;
      const { subtotalCdf } = this.resolveFoodItemsSubtotalCdf(r.menuItems, order.items as CreateFoodDeliveryDto['items']);
      itemsSubtotalCdf += subtotalCdf;
      const distanceKm = this.pricing.haversineKm(r.lat, r.lng, dto.deliveryLat, dto.deliveryLng);
      const durationMin = (distanceKm / 20) * 60;
      if (distanceKm > maxDistanceKm) maxDistanceKm = distanceKm;
      if (durationMin > maxDurationMin) maxDurationMin = durationMin;
    }

    const foodSurcharge = await this.surcharges.get(SurchargeType.DELIVERY_FOOD);
    const fare = await this.pricing.estimateFare(VehicleType.MOTO_TAXI, maxDistanceKm, maxDurationMin);
    const deliveryFeeCdf = Math.max(foodSurcharge.baseFeeCdf || FOOD_DELIVERY_BASE_CDF, Math.ceil(fare.estimatedFareCdf * foodSurcharge.multiplier));
    const subtotalWithDelivery = itemsSubtotalCdf + deliveryFeeCdf;
    const promoApplied = await this.applyFoodPromo(subtotalWithDelivery, dto.promoCode, false);

    return {
      restaurants: restaurants.map((r) => ({ id: r.id, name: r.name })),
      itemsSubtotalCdf,
      deliveryFeeCdf,
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      estimatedPriceCdf: promoApplied.estimatedPriceCdf,
      formatted: `${promoApplied.estimatedPriceCdf.toLocaleString('fr-CD')} FC`,
      distanceKm: maxDistanceKm,
      durationMin: maxDurationMin,
    };
  }

  async createFoodMulti(userId: string, dto: CreateFoodMultiDeliveryDto) {
    if (!dto.orders?.length) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ajoutez au moins un restaurant.');

    const restaurants = await this.prisma.restaurant.findMany({
      where: { id: { in: dto.orders.map((o) => o.restaurantId) }, isActive: true },
    });
    if (restaurants.length !== dto.orders.length) {
      throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    // Normalize items and compute subtotal
    const normalizedOrders = dto.orders.map((o) => {
      const r = restaurants.find((x) => x.id === o.restaurantId)!;
      const { subtotalCdf, normalizedItems } = this.resolveFoodItemsSubtotalCdf(r.menuItems, o.items as CreateFoodDeliveryDto['items']);
      return { restaurant: r, items: normalizedItems, subtotalCdf };
    });
    const itemsSubtotalCdf = normalizedOrders.reduce((sum, o) => sum + o.subtotalCdf, 0);
    const estimate = await this.estimateFoodMulti({ ...dto, orders: normalizedOrders.map((o) => ({ restaurantId: o.restaurant.id, items: o.items })) });
    const promoApplied = await this.applyFoodPromo(itemsSubtotalCdf + estimate.deliveryFeeCdf, dto.promoCode, true);

    // Pickup uses first restaurant for now (single delivery entity)
    const first = normalizedOrders[0].restaurant;
    const delivery = await this.prisma.delivery.create({
      data: {
        userId,
        type: DeliveryType.FOOD,
        status: DeliveryStatus.PENDING,
        deliveryPin: generateDeliveryPin(),
        restaurantId: null,
        items: normalizedOrders.map((o) => ({ restaurantId: o.restaurant.id, restaurantName: o.restaurant.name, items: o.items })) as unknown as Prisma.InputJsonValue,
        deliveryAddress: dto.deliveryAddress,
        deliveryLat: dto.deliveryLat,
        deliveryLng: dto.deliveryLng,
        pickupLat: first.lat,
        pickupLng: first.lng,
        pickupAddress: first.address,
        estimatedPriceCdf: promoApplied.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { events: true },
    });

    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        event: 'ORDER_PLACED',
        metadata: { orders: normalizedOrders.map((o) => ({ restaurantId: o.restaurant.id, restaurantName: o.restaurant.name, items: o.items })), promoCode: promoApplied.promoCode, discountCdf: promoApplied.discountCdf } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.redis.publish(MOVA_EVENTS.DELIVERY_CREATED, {
      deliveryId: delivery.id,
      userId,
      type: delivery.type,
      restaurantName: 'Multi-restaurants',
      estimatedPriceCdf: delivery.estimatedPriceCdf,
    });

    const withEvents = { ...delivery, events: [{ id: '1', deliveryId: delivery.id, event: 'ORDER_PLACED', metadata: null, createdAt: new Date() }] };
    return { delivery: formatParcelDelivery(withEvents), estimate: { ...estimate, estimatedPriceCdf: promoApplied.estimatedPriceCdf, discountCdf: promoApplied.discountCdf } };
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
    if (!restaurant.isAcceptingOrders) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ce restaurant n\'accepte pas de commandes pour le moment.');
    }
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
      rated: await this.prisma.deliveryRating.findUnique({
        where: { deliveryId_fromUserId: { deliveryId: id, fromUserId: userId } },
      }).then((r) => r != null),
    };
  }

  async rateDelivery(id: string, userId: string, dto: RateDeliveryDto) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id }, include: { restaurant: true } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (delivery.type !== DeliveryType.FOOD) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    if (delivery.status !== DeliveryStatus.DELIVERED) throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    const existing = await this.prisma.deliveryRating.findUnique({
      where: { deliveryId_fromUserId: { deliveryId: id, fromUserId: userId } },
    });
    if (existing) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Commande déjà notée.');
    const rating = await this.prisma.deliveryRating.create({
      data: {
        deliveryId: id,
        fromUserId: userId,
        restaurantScore: dto.restaurantScore,
        courierScore: dto.courierScore,
        comment: dto.comment,
      },
    });
    if (delivery.restaurantId) {
      const agg = await this.prisma.deliveryRating.aggregate({
        where: { delivery: { restaurantId: delivery.restaurantId } },
        _avg: { restaurantScore: true },
      });
      if (agg._avg.restaurantScore) {
        await this.prisma.restaurant.update({
          where: { id: delivery.restaurantId },
          data: { rating: Math.round(agg._avg.restaurantScore * 10) / 10 },
        });
      }
    }
    if (delivery.driverId && dto.courierScore != null) {
      await fetch(serviceUrl('driver', `/internal/drivers/${delivery.driverId}/rating`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ ratingAvg: dto.courierScore }),
      }).catch(() => undefined);
    }
    return rating;
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

  async listRestaurants(
    deliveryLat?: number,
    deliveryLng?: number,
    cuisine?: string,
    maxEtaMin?: number,
    maxPriceCdf?: number,
    maxDistanceKm?: number,
  ) {
    const rows = await this.prisma.restaurant.findMany({
      where: {
        isActive: true,
        ...(cuisine?.trim() ? { cuisine: { contains: cuisine.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { rating: 'desc' },
      select: {
        id: true, name: true, cuisine: true, address: true, lat: true, lng: true,
        rating: true, imageUrl: true, menuItems: true, promotionLabel: true,
      },
    });

    let scoped = rows;
    if (deliveryLat != null && deliveryLng != null) {
      const city = resolveCityFromCoords(deliveryLat, deliveryLng);
      const cityLower = city.toLowerCase();
      const inCity = rows.filter(
        (r) =>
          r.address.toLowerCase().includes(cityLower) ||
          resolveCityFromCoords(r.lat, r.lng).toLowerCase() === cityLower,
      );
      if (inCity.length > 0) {
        scoped = inCity;
      } else {
        const kinshasa = rows.filter((r) => r.address.toLowerCase().includes('kinshasa'));
        if (kinshasa.length > 0) scoped = kinshasa;
      }
    } else {
      const kinshasa = rows.filter((r) => r.address.toLowerCase().includes('kinshasa'));
      if (kinshasa.length > 0) scoped = kinshasa;
    }

    const data = scoped
      .map((r) => {
        let deliveryEtaMin: number | null = null;
        let distanceKm: number | null = null;
        let minMenuPriceCdf = 0;
        const menu = (r.menuItems as { unitPriceCdf?: number; priceCdf?: number }[] | null) ?? [];
        if (menu.length > 0) {
          minMenuPriceCdf = menu.reduce((min, item) => {
            const p = item.unitPriceCdf ?? item.priceCdf ?? 0;
            return min === 0 ? p : Math.min(min, p);
          }, 0);
        }
        if (deliveryLat != null && deliveryLng != null) {
          distanceKm = this.pricing.haversineKm(r.lat, r.lng, deliveryLat, deliveryLng);
          const travelMin = Math.ceil((distanceKm / 20) * 60);
          deliveryEtaMin = Math.max(20, travelMin + 15);
        }
        return { ...r, deliveryEtaMin, distanceKm, minMenuPriceCdf };
      })
      .filter((r) => (maxEtaMin != null ? (r.deliveryEtaMin ?? 999) <= maxEtaMin : true))
      .filter((r) => (maxPriceCdf != null ? (r.minMenuPriceCdf ?? 0) <= maxPriceCdf : true))
      .filter((r) => (maxDistanceKm != null ? (r.distanceKm ?? 999) <= maxDistanceKm : true))
      .sort((a, b) => {
        if (deliveryLat == null || deliveryLng == null) return 0;
        const da = this.pricing.haversineKm(a.lat, a.lng, deliveryLat, deliveryLng);
        const db = this.pricing.haversineKm(b.lat, b.lng, deliveryLat, deliveryLng);
        return da - db;
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
        driverId: null,
        type: { in: [DeliveryType.PARCEL, DeliveryType.FOOD, DeliveryType.EXPRESS] },
        OR: [
          { type: { in: [DeliveryType.PARCEL, DeliveryType.EXPRESS] }, status: DeliveryStatus.PENDING },
          {
            type: DeliveryType.FOOD,
            status: { in: [DeliveryStatus.RESTAURANT_CONFIRMED, DeliveryStatus.READY_FOR_PICKUP] },
          },
        ],
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
        const dropLat = d.dropoffLat ?? d.deliveryLat ?? pickupLat;
        const dropLng = d.dropoffLng ?? d.deliveryLng ?? pickupLng;
        const tripKm = tripDistanceKm(pickupLat, pickupLng, dropLat, dropLng, d.distanceKm);
        const distanceToPickupKm = tripDistanceKm(profile.currentLat!, profile.currentLng!, pickupLat, pickupLng);
        const formatted = formatParcelDelivery(d as Parameters<typeof formatParcelDelivery>[0]);
        return {
          ...formatted,
          distanceKm: tripKm,
          tripDistanceKm: tripKm,
          distanceToPickupKm,
          offerType: 'DELIVERY',
          type: d.type,
          restaurantName: d.restaurant?.name,
        };
      })
      .filter((o) => o.distanceToPickupKm <= radiusKm)
      .sort((a, b) => a.distanceToPickupKm - b.distanceToPickupKm);

    return { offers };
  }

  async acceptDelivery(deliveryId: string, driverUserId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const foodAcceptable =
      delivery.type === DeliveryType.FOOD &&
      (delivery.status === DeliveryStatus.RESTAURANT_CONFIRMED ||
        delivery.status === DeliveryStatus.READY_FOR_PICKUP);
    const parcelAcceptable =
      delivery.type !== DeliveryType.FOOD && delivery.status === DeliveryStatus.PENDING;
    if (!foodAcceptable && !parcelAcceptable) {
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
    const courier = await this.fetchCourierProfile(driverUserId);
    const formatted = formatParcelDelivery(updated, courier);
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
      [DeliveryStatus.RESTAURANT_CONFIRMED]: [DeliveryStatus.CANCELLED],
      [DeliveryStatus.READY_FOR_PICKUP]: [DeliveryStatus.CANCELLED],
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
    const courier = updated.driverId ? await this.fetchCourierProfile(updated.driverId) : null;
    const formatted = formatParcelDelivery(updated, courier);
    const statusLabel = this.deliveryStatusLabel(updated.type, status);
    await this.redis.publish(MOVA_EVENTS.DELIVERY_STATUS_UPDATED, {
      deliveryId: id,
      userId: delivery.userId,
      type: delivery.type,
      status,
      restaurantName: updated.restaurant?.name,
    });
    return { delivery: formatted, paymentReady: status === DeliveryStatus.DELIVERED, statusLabel };
  }

  private deliveryStatusLabel(type: DeliveryType, status: DeliveryStatus): string {
    if (type === DeliveryType.FOOD) {
      return (
        {
          [DeliveryStatus.PENDING]: 'En attente du restaurant',
          [DeliveryStatus.RESTAURANT_CONFIRMED]: 'En préparation',
          [DeliveryStatus.READY_FOR_PICKUP]: 'Prête — livreur en route',
          [DeliveryStatus.PICKED_UP]: 'Livreur assigné',
          [DeliveryStatus.IN_TRANSIT]: 'Livreur en route',
          [DeliveryStatus.DELIVERED]: 'Commande livrée',
          [DeliveryStatus.CANCELLED]: 'Commande annulée',
        }[status] ?? status
      );
    }
    return status;
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
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } }, restaurant: true },
    });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);

    const updates: Record<string, unknown> = { status };
    if (status === DeliveryStatus.PICKED_UP) updates.pickedUpAt = new Date();
    if (status === DeliveryStatus.DELIVERED) updates.deliveredAt = new Date();
    if (status === DeliveryStatus.CANCELLED) updates.cancelledAt = new Date();

    const updated = await this.prisma.delivery.update({
      where: { id },
      data: updates,
      include: { events: { orderBy: { createdAt: 'asc' } }, restaurant: true },
    });
    await this.prisma.deliveryEvent.create({
      data: { deliveryId: id, event: status, metadata: { updatedBy: 'admin' } },
    });
    const courier = updated.driverId ? await this.fetchCourierProfile(updated.driverId) : null;
    const formatted = formatParcelDelivery(updated, courier);
    const statusLabel = this.deliveryStatusLabel(updated.type, status);
    await this.redis.publish(MOVA_EVENTS.DELIVERY_STATUS_UPDATED, {
      deliveryId: id,
      userId: delivery.userId,
      type: delivery.type,
      status,
      restaurantName: updated.restaurant?.name,
    });
    return { delivery: formatted, paymentReady: status === DeliveryStatus.DELIVERED, statusLabel };
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
