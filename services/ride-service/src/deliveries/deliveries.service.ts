import { HttpStatus, Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, Prisma, SurchargeType, TrackingReferenceType, VehicleType, WeightCategory, CommissionServiceType } from '@prisma/client';
import { driverEligibleForParcelWeight, INTERNAL_API_KEY, MARKET_RDC, MOVA_EVENTS, MovaErrorCode, MovaHttpException, canCancelDelivery, estimateTripDurationMin, formatCdf, normalizeVehicleType, resolveCityFromCoords, serviceUrl, VehicleTypeValue } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { PromoService, SurchargeService } from '../rides/surcharge.service';
import { CreateFoodDeliveryDto, CreateFoodMultiDeliveryDto, CreateParcelDeliveryDto, RateDeliveryDto } from './deliveries.dto';
import { assertServiceAreaPair } from '../common/address.util';
import { tripDistanceKm } from '../common/geo.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { fetchServicePaymentStatus } from '../common/payment-status.util';
import {
  buildParcelTimeline,
  detectCommune,
  formatParcelDelivery,
  generateDeliveryPin,
} from './parcel.util';
import { assertDriverCanReceiveJobs, assertDriverEligibleForParcel, driverCanReceiveJobs, fetchDriverProfileSnapshot } from '../common/driver-eligibility.util';
import { fetchDriverDebtStatus } from '../common/driver-debt.util';
import { TrackingService } from '../tracking/tracking.service';
import { MatchingService } from '../matching/matching.service';
import { notifyNearbyDrivers, DELIVERY_ALERT_VEHICLE_TYPES } from '../common/driver-job-alert.util';
import { CommissionService } from '../rides/commission.service';
import { deliveryDriverGross } from './delivery-driver-gross.util';
import { parseFoodItemShares, parseOrderPlacedMetadata } from './food-delivery-settlement.util';
import { applyPromoCode, formatPromoValidation } from '../common/promo-apply.util';
import { RoutingService } from '../geo/routing.service';

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
const MAX_FOOD_DELIVERY_DISTANCE_KM = 30;
const MAX_FOOD_DELIVERY_FEE_CDF = 20_000;
const RESTAURANT_LIST_RADIUS_KM = 50;

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
    private trackingService: TrackingService,
    private matching: MatchingService,
    private commission: CommissionService,
    private routing: RoutingService,
  ) {}

  private async alertDeliveryOffer(delivery: {
    id: string;
    type: DeliveryType;
    pickupLat?: number | null;
    pickupLng?: number | null;
    pickupAddress?: string | null;
    restaurant?: { name?: string | null; lat?: number | null; lng?: number | null; address?: string | null } | null;
  }) {
    const pickupLat = delivery.pickupLat ?? delivery.restaurant?.lat;
    const pickupLng = delivery.pickupLng ?? delivery.restaurant?.lng;
    if (pickupLat == null || pickupLng == null) return;
    const pickup = delivery.pickupAddress?.trim() || delivery.restaurant?.address?.trim() || delivery.restaurant?.name?.trim() || 'près de vous';
    const label =
      delivery.type === DeliveryType.FOOD ? 'Repas' : delivery.type === DeliveryType.EXPRESS ? 'Express' : 'Colis';
    await notifyNearbyDrivers(this.redis, this.matching, {
      jobKind: 'DELIVERY_OFFER',
      referenceId: delivery.id,
      pickupLat,
      pickupLng,
      pickupAddress: pickup,
      title: 'Nouvelle livraison MOVA',
      body: `${label} · ${pickup}`,
      vehicleTypes: DELIVERY_ALERT_VEHICLE_TYPES,
      data: { deliveryType: delivery.type },
    }).catch(() => undefined);
  }

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

  async estimateParcel(dto: CreateParcelDeliveryDto, redeemPromo = false) {
    this.validateParcelDto(dto);
    const { pickupArea, dropoffArea, isInterCity } = assertServiceAreaPair(
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
    );
    const weightCategory = this.resolveWeightCategory(dto);
    const route = await this.routing.resolveRoadDistance(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const distanceKm = route.distanceKm;
    const durationMin = route.durationMin ?? estimateTripDurationMin(distanceKm, MARKET_RDC.trip.averageSpeedKmh.delivery);
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin, pickupArea.name);
    const withInterCity = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const multiplier = this.weightMultiplier(weightCategory, dto.weightKg);
    const beforePromo = Math.ceil(withInterCity.estimatedFareCdf * multiplier);
    const promoApplied = await applyPromoCode(this.promo, beforePromo, dto.promoCode, redeemPromo, {
      context: { serviceType: 'PARCEL' },
    });
    const estimatedPriceCdf = promoApplied.estimatedPriceCdf;
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
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
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
    const estimate = await this.estimateParcel(dto, true);
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
        promoCode: estimate.promoCode,
        discountCdf: estimate.discountCdf || undefined,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { events: true },
    });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, event: 'CREATED' } });
    await this.alertDeliveryOffer(delivery);
    const formatted = formatParcelDelivery({ ...delivery, events: [{ id: '1', deliveryId: delivery.id, event: 'CREATED', metadata: null, createdAt: new Date() }] });
    return { delivery: formatted, estimate };
  }

  private async applyFoodPromo(
    itemsSubtotalCdf: number,
    deliveryFeeCdf: number,
    promoCode?: string,
    redeem = false,
    restaurantId?: string,
  ) {
    return applyPromoCode(this.promo, itemsSubtotalCdf + deliveryFeeCdf, promoCode, redeem, {
      context: { serviceType: 'FOOD', restaurantId },
      parts: { itemsSubtotalCdf, deliveryFeeCdf },
    });
  }

  async validatePromoCode(code: string, restaurantId?: string) {
    const promo = await this.promo.peek(code, { serviceType: 'FOOD', restaurantId });
    return formatPromoValidation(promo);
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

  /** Frais et distance livraison repas — distance routière (inter-villes autorisée). */
  private async computeFoodDeliveryQuote(
    restaurantLat: number,
    restaurantLng: number,
    deliveryLat: number,
    deliveryLng: number,
  ) {
    assertServiceAreaPair(restaurantLat, restaurantLng, deliveryLat, deliveryLng);
    const distanceKm = await this.routing.roadDistanceKm(restaurantLat, restaurantLng, deliveryLat, deliveryLng);
    const restaurantCity = resolveCityFromCoords(restaurantLat, restaurantLng).toLowerCase();
    const deliveryCity = resolveCityFromCoords(deliveryLat, deliveryLng).toLowerCase();
    const isInterCity = restaurantCity !== deliveryCity;
    const maxKm = isInterCity ? 200 : MAX_FOOD_DELIVERY_DISTANCE_KM;
    if (distanceKm > maxKm) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        `Livraison hors zone (${maxKm} km max depuis le restaurant).`,
      );
    }
    const durationMin = estimateTripDurationMin(distanceKm, MARKET_RDC.trip.averageSpeedKmh.delivery);
    const foodSurcharge = await this.surcharges.get(SurchargeType.DELIVERY_FOOD);
    const fare = await this.pricing.estimateFare(VehicleType.MOTO_TAXI, distanceKm, durationMin);
    const rawFee = Math.max(
      foodSurcharge.baseFeeCdf || FOOD_DELIVERY_BASE_CDF,
      Math.ceil(fare.estimatedFareCdf * foodSurcharge.multiplier),
    );
    const cap = MAX_FOOD_DELIVERY_FEE_CDF;
    return { distanceKm, durationMin, deliveryFeeCdf: Math.min(rawFee, cap) };
  }

  async estimateFood(dto: CreateFoodDeliveryDto) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: dto.restaurantId } });
    if (!restaurant || !restaurant.isActive) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!restaurant.isAcceptingOrders) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ce restaurant n\'accepte pas de commandes pour le moment.');
    }
    const foodSurcharge = await this.surcharges.get(SurchargeType.DELIVERY_FOOD);
    const { subtotalCdf: itemsSubtotal } = this.resolveFoodItemsSubtotalCdf(restaurant.menuItems, dto.items);
    const { distanceKm, durationMin, deliveryFeeCdf } = await this.computeFoodDeliveryQuote(
      restaurant.lat,
      restaurant.lng,
      dto.deliveryLat,
      dto.deliveryLng,
    );
    const subtotalWithDelivery = itemsSubtotal + deliveryFeeCdf;
    const promoApplied = await this.applyFoodPromo(itemsSubtotal, deliveryFeeCdf, dto.promoCode, false, dto.restaurantId);
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
    const promoApplied = await this.applyFoodPromo(subtotalCdf, estimate.deliveryFeeCdf, dto.promoCode, true, dto.restaurantId);
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
        promoCode: promoApplied.promoCode,
        discountCdf: promoApplied.discountCdf || undefined,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { restaurant: true, events: true },
    });
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        event: 'ORDER_PLACED',
        metadata: {
          items: normalizedItems,
          itemsSubtotalCdf: estimate.itemsSubtotalCdf,
          deliveryFeeCdf: estimate.deliveryFeeCdf,
          promoCode: promoApplied.promoCode,
          discountCdf: promoApplied.discountCdf,
          absorbedBy: promoApplied.settlement?.absorbedBy,
          partnerDiscountCdf: promoApplied.settlement?.partnerDiscountCdf,
          platformDiscountCdf: promoApplied.settlement?.platformDiscountCdf,
        } as unknown as Prisma.InputJsonValue,
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

    const foodSurcharge = await this.surcharges.get(SurchargeType.DELIVERY_FOOD);
    let itemsSubtotalCdf = 0;
    let maxDistanceKm = 0;
    let maxDurationMin = 0;
    let deliveryFeeCdf = foodSurcharge.baseFeeCdf || FOOD_DELIVERY_BASE_CDF;

    for (const order of dto.orders) {
      const r = restaurants.find((x) => x.id === order.restaurantId)!;
      const { subtotalCdf } = this.resolveFoodItemsSubtotalCdf(r.menuItems, order.items as CreateFoodDeliveryDto['items']);
      itemsSubtotalCdf += subtotalCdf;
      const quote = await this.computeFoodDeliveryQuote(r.lat, r.lng, dto.deliveryLat, dto.deliveryLng);
      if (quote.distanceKm > maxDistanceKm) maxDistanceKm = quote.distanceKm;
      if (quote.durationMin > maxDurationMin) maxDurationMin = quote.durationMin;
      deliveryFeeCdf = Math.max(deliveryFeeCdf, quote.deliveryFeeCdf);
    }

    const subtotalWithDelivery = itemsSubtotalCdf + deliveryFeeCdf;
    const promoApplied = await this.applyFoodPromo(itemsSubtotalCdf, deliveryFeeCdf, dto.promoCode, false);

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
    const promoApplied = await this.applyFoodPromo(itemsSubtotalCdf, estimate.deliveryFeeCdf, dto.promoCode, true);

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
        promoCode: promoApplied.promoCode,
        discountCdf: promoApplied.discountCdf || undefined,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { events: true },
    });

    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        event: 'ORDER_PLACED',
        metadata: {
          orders: normalizedOrders.map((o) => ({ restaurantId: o.restaurant.id, restaurantName: o.restaurant.name, items: o.items })),
          itemsSubtotalCdf: estimate.itemsSubtotalCdf,
          deliveryFeeCdf: estimate.deliveryFeeCdf,
          promoCode: promoApplied.promoCode,
          discountCdf: promoApplied.discountCdf,
          absorbedBy: promoApplied.settlement?.absorbedBy,
          partnerDiscountCdf: promoApplied.settlement?.partnerDiscountCdf,
          platformDiscountCdf: promoApplied.settlement?.platformDiscountCdf,
        } as unknown as Prisma.InputJsonValue,
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

  async estimateExpress(dto: CreateParcelDeliveryDto, redeemPromo = false) {
    const parcel = await this.estimateParcel({ ...dto, promoCode: undefined });
    const express = await this.surcharges.get(SurchargeType.DELIVERY_EXPRESS);
    const beforePromo = Math.ceil(parcel.estimatedPriceCdf * express.multiplier + express.baseFeeCdf);
    const promoApplied = await applyPromoCode(this.promo, beforePromo, dto.promoCode, redeemPromo, {
      context: { serviceType: 'EXPRESS' },
    });
    const estimatedPriceCdf = promoApplied.estimatedPriceCdf;
    return {
      ...parcel,
      type: 'EXPRESS',
      estimatedPriceCdf,
      priceCdf: estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      formattedPrice: formatCdf(estimatedPriceCdf),
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      expressSurchargeCdf: beforePromo - parcel.estimatedPriceCdf,
      etaMin: Math.max(15, Math.ceil((parcel.durationMin ?? 30) * 0.6)),
    };
  }

  async createExpress(userId: string, dto: CreateParcelDeliveryDto) {
    const estimate = await this.estimateExpress(dto, true);
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
        promoCode: estimate.promoCode,
        discountCdf: estimate.discountCdf || undefined,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
      include: { events: true },
    });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, event: 'EXPRESS_CREATED' } });
    await this.alertDeliveryOffer(delivery);
    const formatted = formatParcelDelivery({ ...delivery, events: [{ id: '1', deliveryId: delivery.id, event: 'EXPRESS_CREATED', metadata: null, createdAt: new Date() }] });
    return { delivery: formatted, estimate };
  }

  async cancelDelivery(id: string, userId: string) {
    return this.updateStatus(id, DeliveryStatus.CANCELLED, userId);
  }

  private async enrichDeliveryPayment<T extends { paymentReady?: boolean }>(formatted: T, deliveryId: string) {
    const payment = await fetchServicePaymentStatus('DELIVERY', deliveryId);
    return {
      ...formatted,
      isPaid: payment.isPaid,
      paymentStatus: payment.paymentStatus,
      paymentMethod: payment.paymentMethod ?? null,
      paymentReady: Boolean(formatted.paymentReady) && !payment.isPaid,
    };
  }

  /** Décomposition prix passager + revenu net livreur (style Glovo/Uber). */
  private enrichPassengerPricingFields(
    delivery: {
      type: DeliveryType;
      items: unknown;
      finalPriceCdf: number | null;
      estimatedPriceCdf: number | null;
      discountCdf: number | null;
      events?: { event: string; metadata: unknown }[];
    },
    formatted: Record<string, unknown>,
  ) {
    const totalCdf = delivery.finalPriceCdf ?? delivery.estimatedPriceCdf ?? 0;
    const enriched: Record<string, unknown> = {
      ...formatted,
      passengerTotalCdf: totalCdf,
    };
    if (delivery.type === DeliveryType.FOOD) {
      const meta = parseOrderPlacedMetadata(delivery.events);
      const shares = parseFoodItemShares(delivery.items);
      const itemsGross = shares.reduce((sum, share) => sum + share.itemsGrossCdf, 0);
      const itemsSubtotalCdf = meta.itemsSubtotalCdf ?? itemsGross;
      const discountCdf = delivery.discountCdf ?? 0;
      const deliveryFeeCdf =
        meta.deliveryFeeCdf ?? Math.max(0, totalCdf + discountCdf - itemsSubtotalCdf);
      enriched.itemsSubtotalCdf = itemsSubtotalCdf;
      enriched.deliveryFeeCdf = deliveryFeeCdf;
      enriched.discountCdf = discountCdf;
    }
    return enriched;
  }

  private async enrichDeliveryForViewer(
    delivery: {
      type: DeliveryType;
      driverId: string | null;
      items: unknown;
      finalPriceCdf: number | null;
      estimatedPriceCdf: number | null;
      discountCdf: number | null;
      events?: { event: string; metadata: unknown }[];
    },
    formatted: Record<string, unknown>,
    viewerUserId?: string,
  ) {
    let result = this.enrichPassengerPricingFields(delivery, formatted);
    if (viewerUserId && delivery.driverId === viewerUserId) {
      const driverGross = deliveryDriverGross(delivery);
      const rule = await this.commission.get(CommissionServiceType.DELIVERY);
      result = {
        ...result,
        driverGrossCdf: driverGross,
        driverNetCdf: Math.round(this.commission.splitGross(driverGross, rule.platformPercent).driverNetCdf),
      };
    }
    return result;
  }

  private static readonly ACTIVE_PASSENGER_STATUSES: DeliveryStatus[] = [
    DeliveryStatus.PENDING,
    DeliveryStatus.RESTAURANT_CONFIRMED,
    DeliveryStatus.READY_FOR_PICKUP,
    DeliveryStatus.PICKED_UP,
    DeliveryStatus.IN_TRANSIT,
  ];

  /** Livraison active du passager pour reprise après fermeture de l'app. */
  async getActiveDelivery(passengerId: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        userId: passengerId,
        status: { in: DeliveriesService.ACTIVE_PASSENGER_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!delivery) return { delivery: null };
    const courier = delivery.driverId ? await this.fetchCourierProfile(delivery.driverId) : null;
    const formatted = await this.enrichDeliveryPayment(
      await this.enrichDeliveryForViewer(
        delivery,
        formatParcelDelivery(delivery, courier),
        passengerId,
      ),
      delivery.id,
    );
    return { delivery: formatted };
  }

  async rejectDelivery(deliveryId: string, driverUserId: string, reason: string = 'explicit') {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.driverId) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    const rejectable =
      (delivery.type !== DeliveryType.FOOD && delivery.status === DeliveryStatus.PENDING) ||
      (delivery.type === DeliveryType.FOOD && delivery.status === DeliveryStatus.READY_FOR_PICKUP);
    if (!rejectable) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId,
        event: 'DRIVER_REJECTED',
        metadata: { driverUserId, reason: reason === 'timeout' ? 'timeout' : 'explicit' },
      },
    });
    return { success: true, deliveryId };
  }

  async getRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant || !restaurant.isActive) throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!restaurant.isAcceptingOrders) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ce restaurant n\'accepte pas de commandes pour le moment.');
    }
    const menu = this.publicMenuItems(restaurant.menuItems);
    return {
      ...restaurant,
      menuItems: menu,
      menu,
    };
  }

  private publicMenuItems(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return (entry as { isAvailable?: boolean }).isAvailable !== false;
    });
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
    const formatted = await this.enrichDeliveryPayment(
      await this.enrichDeliveryForViewer(delivery, formatParcelDelivery(delivery, courier), userId),
      id,
    );
    const gpsTrace = await this.trackingService.getTrace(TrackingReferenceType.DELIVERY, id);
    return {
      delivery: formatted,
      tracking: formatted.timeline,
      courierLocation: formatted.courierLocation,
      courier: formatted.courier,
      etaMinutes: formatted.etaMinutes,
      deliveryPin: formatted.deliveryPin,
      paymentReady: formatted.paymentReady,
      isPaid: formatted.isPaid,
      paymentStatus: formatted.paymentStatus,
      paymentMethod: formatted.paymentMethod,
      gpsTrace,
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
    deliveryCity?: string,
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

    /** Rayon livraison repas autour du point de livraison (km). */
    const DELIVERY_RADIUS_KM = RESTAURANT_LIST_RADIUS_KM;

    const cityKey = deliveryCity?.trim().toLowerCase();
    let scoped = rows;
    if (cityKey) {
      scoped = rows.filter((r) => resolveCityFromCoords(r.lat, r.lng).toLowerCase() === cityKey);
    } else if (deliveryLat != null && deliveryLng != null) {
      const resolvedDeliveryCity = resolveCityFromCoords(deliveryLat, deliveryLng).toLowerCase();
      scoped = rows.filter((r) => {
        const restaurantCity = resolveCityFromCoords(r.lat, r.lng).toLowerCase();
        if (restaurantCity === resolvedDeliveryCity) return true;
        return this.pricing.haversineKm(r.lat, r.lng, deliveryLat, deliveryLng) <= DELIVERY_RADIUS_KM;
      });
    }

    const data = (await Promise.all(
      scoped.map(async (r) => {
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
          distanceKm = await this.routing.roadDistanceKm(r.lat, r.lng, deliveryLat, deliveryLng);
          const travelMin = estimateTripDurationMin(distanceKm, MARKET_RDC.trip.averageSpeedKmh.delivery);
          deliveryEtaMin = Math.max(20, travelMin + 15);
        }
        return { ...r, menuItems: this.publicMenuItems(r.menuItems), deliveryEtaMin, distanceKm, minMenuPriceCdf };
      }),
    ))
      .filter((r) => (maxEtaMin != null ? (r.deliveryEtaMin ?? 999) <= maxEtaMin : true))
      .filter((r) => (maxPriceCdf != null ? (r.minMenuPriceCdf ?? 0) <= maxPriceCdf : true))
      .filter((r) => (maxDistanceKm != null ? (r.distanceKm ?? 999) <= maxDistanceKm : true))
      .sort((a, b) => {
        if (deliveryLat == null || deliveryLng == null) return 0;
        return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
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
        operatingCity?: string | null;
        ratingAvg?: number;
      };
    } catch {
      return null;
    }
  }

  async getDriverOffers(driverUserId: string) {
    const profile = await fetchDriverProfileSnapshot(driverUserId);
    const debtStatus = await fetchDriverDebtStatus(driverUserId);
    if (debtStatus.debtBlocked) {
      return {
        offers: [] as Record<string, unknown>[],
        documentsBlocked: false,
        debtBlocked: true,
        openDebtCdf: debtStatus.openDebtCdf,
        debtThresholdCdf: debtStatus.debtThresholdCdf,
      };
    }
    if (!profile?.isAvailable || !driverCanReceiveJobs(profile)) {
      return { offers: [] as Record<string, unknown>[], documentsBlocked: profile?.documentsStatus?.canOperate === false };
    }

    const hasGps = profile.currentLat != null && profile.currentLng != null;
    const operatingCity = (profile.operatingCity?.trim() || 'Kinshasa').toLowerCase();

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        driverId: null,
        type: { in: [DeliveryType.PARCEL, DeliveryType.FOOD, DeliveryType.EXPRESS] },
        OR: [
          { type: { in: [DeliveryType.PARCEL, DeliveryType.EXPRESS] }, status: DeliveryStatus.PENDING },
          {
            type: DeliveryType.FOOD,
            status: DeliveryStatus.READY_FOR_PICKUP,
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        restaurant: { select: { id: true, name: true, cuisine: true, lat: true, lng: true, address: true } },
        events: { where: { event: 'DRIVER_REJECTED' } },
      },
    });

    const radiusKm = MARKET_RDC.matching.maxRadiusKm;
    const deliveryRule = await this.commission.get(CommissionServiceType.DELIVERY);
    const driverTypes = (profile.vehicles ?? [])
      .filter((v) => v.isActive !== false)
      .map((v) => {
        try {
          return normalizeVehicleType(v.type) as VehicleTypeValue;
        } catch {
          return null;
        }
      })
      .filter((t): t is VehicleTypeValue => t != null);
    const offers = deliveries
      .filter((d) => {
        const rejected = d.events.some((e) => {
          if (e.event !== 'DRIVER_REJECTED') return false;
          const meta = e.metadata as { driverUserId?: string; reason?: string };
          if (meta?.driverUserId !== driverUserId) return false;
          if (meta.reason === 'explicit') return true;
          const ageMs = Date.now() - e.createdAt.getTime();
          return ageMs < 90_000;
        });
        return !rejected;
      })
      .map((d) => {
        const pickupLat = d.pickupLat ?? d.restaurant?.lat ?? 0;
        const pickupLng = d.pickupLng ?? d.restaurant?.lng ?? 0;
        const dropLat = d.dropoffLat ?? d.deliveryLat ?? pickupLat;
        const dropLng = d.dropoffLng ?? d.deliveryLng ?? pickupLng;
        const tripKm = tripDistanceKm(pickupLat, pickupLng, dropLat, dropLng, d.distanceKm);
        const distanceToPickupKm = hasGps
          ? tripDistanceKm(profile.currentLat!, profile.currentLng!, pickupLat, pickupLng)
          : Number.POSITIVE_INFINITY;
        const pickupCity = resolveCityFromCoords(pickupLat, pickupLng).toLowerCase();
        const formatted = formatParcelDelivery(d as Parameters<typeof formatParcelDelivery>[0]);
        const driverGross = deliveryDriverGross(d);
        const driverNetCdf = Math.round(
          this.commission.splitGross(driverGross, deliveryRule.platformPercent).driverNetCdf,
        );
        return {
          ...formatted,
          distanceKm: tripKm,
          tripDistanceKm: tripKm,
          distanceToPickupKm,
          driverNetCdf,
          pickupCity,
          offerType: 'DELIVERY',
          type: d.type,
          restaurantName: d.restaurant?.name,
          pickupAddress: formatted.pickupAddress ?? d.restaurant?.address ?? undefined,
        };
      })
      .filter((o) => {
        if (o.type !== DeliveryType.FOOD && !driverEligibleForParcelWeight(driverTypes, o.weightCategory as string | undefined)) {
          return false;
        }
        if (o.type === DeliveryType.FOOD) {
          return o.pickupCity === operatingCity || (hasGps && o.distanceToPickupKm <= radiusKm);
        }
        if (!hasGps) return false;
        return o.distanceToPickupKm <= radiusKm;
      })
      .sort((a, b) => a.distanceToPickupKm - b.distanceToPickupKm);

    return { offers };
  }

  async acceptDelivery(deliveryId: string, driverUserId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.type !== DeliveryType.FOOD) {
      await assertDriverEligibleForParcel(driverUserId, delivery.weightCategory);
    } else {
      await assertDriverCanReceiveJobs(driverUserId);
    }
    const foodAcceptable =
      delivery.type === DeliveryType.FOOD && delivery.status === DeliveryStatus.READY_FOR_PICKUP;
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
    const formatted = await this.enrichDeliveryPayment(
      await this.enrichDeliveryForViewer(delivery, formatParcelDelivery(updated, courier), driverUserId),
      deliveryId,
    );
    return { delivery: formatted, success: true };
  }

  async updateStatus(id: string, status: DeliveryStatus, userId: string, deliveryPin?: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.userId !== userId && delivery.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const isPassenger = delivery.userId === userId;
    const isDriver = delivery.driverId === userId;
    if (isPassenger && !isDriver && status !== DeliveryStatus.CANCELLED) {
      throw new MovaHttpException(
        MovaErrorCode.DELIVERY_INVALID_STATUS,
        HttpStatus.FORBIDDEN,
        'Seul l\'annulation est autorisée depuis l\'application passager.',
      );
    }
    if (isDriver && status === DeliveryStatus.DELIVERED) {
      const expectedPin = String(delivery.deliveryPin ?? '').trim();
      const providedPin = String(deliveryPin ?? '').trim();
      if (!expectedPin || providedPin !== expectedPin) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          'Code PIN de livraison incorrect. Demandez le code au destinataire.',
        );
      }
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
    if (status === DeliveryStatus.CANCELLED) {
      const cancelEligibility = canCancelDelivery({
        status: delivery.status,
        type: delivery.type,
      });
      if (!cancelEligibility.canCancel) {
        throw new MovaHttpException(
          MovaErrorCode.DELIVERY_INVALID_STATUS,
          undefined,
          cancelEligibility.cancelBlockReason,
        );
      }
    }
    const updates: Record<string, unknown> = { status };
    if (status === DeliveryStatus.PICKED_UP) updates.pickedUpAt = new Date();
    if (status === DeliveryStatus.DELIVERED) updates.deliveredAt = new Date();
    if (status === DeliveryStatus.CANCELLED) updates.cancelledAt = new Date();
    const updated = await this.prisma.delivery.update({ where: { id }, data: updates, include: { events: { orderBy: { createdAt: 'asc' } }, restaurant: true } });
    await this.prisma.deliveryEvent.create({ data: { deliveryId: id, event: status, metadata: { updatedBy: userId } } });
    const courier = updated.driverId ? await this.fetchCourierProfile(updated.driverId) : null;
    const formatted = await this.enrichDeliveryPayment(
      await this.enrichDeliveryForViewer(updated, formatParcelDelivery(updated, courier), userId),
      id,
    );
    const statusLabel = this.deliveryStatusLabel(updated.type, status);
    await this.redis.publish(MOVA_EVENTS.DELIVERY_STATUS_UPDATED, {
      deliveryId: id,
      userId: delivery.userId,
      type: delivery.type,
      status,
      restaurantName: updated.restaurant?.name,
      restaurantOwnerUserId: updated.restaurant?.ownerUserId ?? undefined,
    });
    if (status === DeliveryStatus.READY_FOR_PICKUP && !updated.driverId) {
      await this.alertDeliveryOffer(updated);
    }
    return {
      delivery: formatted,
      paymentReady: formatted.paymentReady,
      isPaid: formatted.isPaid,
      paymentStatus: formatted.paymentStatus,
      statusLabel,
    };
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

  async listForAdmin(opts: {
    status?: string;
    type?: string;
    from?: string;
    to?: string;
    search?: string;
    skip?: number;
    take?: number;
  } = {}) {
    const where: Prisma.DeliveryWhereInput = {};
    if (opts.status) where.status = opts.status as DeliveryStatus;
    if (opts.type && opts.type !== 'ERRAND') where.type = opts.type as DeliveryType;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = new Date(opts.from);
      if (opts.to) {
        const toDate = new Date(opts.to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
    const search = opts.search?.trim();
    if (search) {
      where.OR = [
        { pickupAddress: { contains: search, mode: 'insensitive' } },
        { dropoffAddress: { contains: search, mode: 'insensitive' } },
        { deliveryAddress: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { driverId: { contains: search, mode: 'insensitive' } },
        { userId: { contains: search, mode: 'insensitive' } },
        { restaurant: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const take = Math.min(opts.take ?? 50, 100);
    const rows = await this.prisma.delivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: opts.skip ?? 0,
      take,
      include: { restaurant: { select: { name: true } } },
    });
    return Promise.all(
      rows.map(async (d) => {
        const passenger = await fetchAuthUserBrief(d.userId);
        const driver = d.driverId ? await fetchAuthUserBrief(d.driverId) : null;
        return {
          id: d.id,
          type: d.type,
          status: d.status,
          pickupAddress: d.pickupAddress,
          dropoffAddress: d.dropoffAddress ?? d.deliveryAddress,
          restaurantName: d.restaurant?.name,
          weightCategory: d.weightCategory,
          priceCdf: d.estimatedPriceCdf,
          userId: d.userId,
          driverId: d.driverId,
          passengerName: passenger?.name,
          passengerPhone: passenger?.phone,
          driverName: driver?.name,
          driverPhone: driver?.phone,
          createdAt: d.createdAt.toISOString(),
        };
      }),
    );
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
    const gpsTrace = await this.trackingService.getTrace(TrackingReferenceType.DELIVERY, id);
    return {
      id: delivery.id,
      type: delivery.type,
      status: delivery.status,
      userId: delivery.userId,
      pickupAddress: delivery.pickupAddress,
      dropoffAddress: delivery.dropoffAddress ?? delivery.deliveryAddress,
      pickupLat: delivery.pickupLat,
      pickupLng: delivery.pickupLng,
      dropoffLat: delivery.dropoffLat ?? delivery.deliveryLat,
      dropoffLng: delivery.dropoffLng ?? delivery.deliveryLng,
      restaurantName: delivery.restaurant?.name,
      priceCdf: delivery.estimatedPriceCdf,
      createdAt: delivery.createdAt.toISOString(),
      events: delivery.events,
      timeline: formatted.timeline,
      gpsTrace,
    };
  }

  async adminAssignDriver(id: string, driverId: string) {
    if (!driverId?.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Chauffeur requis.');
    }
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new MovaHttpException(MovaErrorCode.DELIVERY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (delivery.type !== DeliveryType.FOOD) {
      await assertDriverEligibleForParcel(driverId.trim(), delivery.weightCategory);
    } else {
      await assertDriverCanReceiveJobs(driverId.trim());
    }
    if (delivery.status === DeliveryStatus.DELIVERED || delivery.status === DeliveryStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.DELIVERY_INVALID_STATUS);
    }
    const nextStatus =
      delivery.type === DeliveryType.FOOD && delivery.status === DeliveryStatus.READY_FOR_PICKUP
        ? DeliveryStatus.PICKED_UP
        : delivery.type !== DeliveryType.FOOD && delivery.status === DeliveryStatus.PENDING
          ? DeliveryStatus.PICKED_UP
          : delivery.status;
    const updated = await this.prisma.delivery.update({
      where: { id },
      data: {
        driverId: driverId.trim(),
        status: nextStatus,
        ...(nextStatus === DeliveryStatus.PICKED_UP ? { pickedUpAt: new Date() } : {}),
      },
      include: { restaurant: true, events: { orderBy: { createdAt: 'asc' } } },
    });
    await this.prisma.deliveryEvent.create({
      data: { deliveryId: id, event: 'ASSIGNED', metadata: { driverUserId: driverId.trim(), by: 'admin' } },
    });
    const courier = await this.fetchCourierProfile(driverId.trim());
    const formatted = formatParcelDelivery(updated, courier);
    await this.redis.publish(MOVA_EVENTS.DELIVERY_STATUS_UPDATED, {
      deliveryId: id,
      userId: delivery.userId,
      type: delivery.type,
      status: updated.status,
      restaurantName: updated.restaurant?.name,
      restaurantOwnerUserId: updated.restaurant?.ownerUserId ?? undefined,
    });
    return { delivery: formatted, driverId: updated.driverId, status: updated.status };
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
    const formatted = await this.enrichDeliveryPayment(formatParcelDelivery(updated, courier), id);
    const statusLabel = this.deliveryStatusLabel(updated.type, status);
    await this.redis.publish(MOVA_EVENTS.DELIVERY_STATUS_UPDATED, {
      deliveryId: id,
      userId: delivery.userId,
      type: delivery.type,
      status,
      restaurantName: updated.restaurant?.name,
      restaurantOwnerUserId: updated.restaurant?.ownerUserId ?? undefined,
    });
    if (status === DeliveryStatus.READY_FOR_PICKUP && !updated.driverId) {
      await this.alertDeliveryOffer(updated);
    }
    return {
      delivery: formatted,
      paymentReady: formatted.paymentReady,
      isPaid: formatted.isPaid,
      paymentStatus: formatted.paymentStatus,
      statusLabel,
    };
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
