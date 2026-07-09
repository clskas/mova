import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RentalInquiryStatus, RentalLogisticsMode, RentalVehicleApprovalStatus } from '@prisma/client';
import { MARKET_RDC, MOVA_EVENTS, MovaErrorCode, MovaHttpException, canCancelRentalBooking, formatCdf, formatRentalRemaining, shouldChargeGpsAddOn, vehicleHasBuiltInGps, type RentalBookingEventKind } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { fetchServicePaymentStatus } from '../common/payment-status.util';
import { assertDriverCanReceiveJobs, assertDriverEligibleForRentalLogistics } from '../common/driver-eligibility.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRentalBookingDto,
  CreateRentalInquiryDto,
  RentalQuoteDto,
  RentalVehicleQueryDto,
} from './rental.dto';
import { applyPromoCode } from '../common/promo-apply.util';
import { PromoService } from '../rides/surcharge.service';
import { TripShareService } from '../share/trip-share.service';

type RentalAddOns = { childSeat?: boolean; gps?: boolean; extraDriver?: boolean };
const RENTAL_OWNER_COMMISSION_PCT = 0.12;

const CATEGORY_ALIASES: Record<string, string> = {
  economique: 'ECONOMY',
  économique: 'ECONOMY',
  economy: 'ECONOMY',
  berline: 'ECONOMY',
  moto: 'ECONOMY',
  suv: 'SUV',
  premium: 'PREMIUM',
  vip: 'PREMIUM',
  citadine: 'ECONOMY',
  utilitaire: 'VAN',
  van: 'VAN',
  camionnette: 'VAN',
};

const TIMELINE_STEPS = [
  { status: RentalInquiryStatus.PENDING, label: 'Demande' },
  { status: RentalInquiryStatus.CONTACTED, label: 'Contact MOVA' },
  { status: RentalInquiryStatus.CONFIRMED, label: 'Confirmée' },
  { status: RentalInquiryStatus.IN_PROGRESS, label: 'En cours' },
  { status: RentalInquiryStatus.RETURNED, label: 'Retournée' },
  { status: RentalInquiryStatus.PAID, label: 'Payée' },
] as const;

const RENTAL_STATUS_LABELS: Record<RentalInquiryStatus, string> = {
  [RentalInquiryStatus.PENDING]: 'En attente',
  [RentalInquiryStatus.CONTACTED]: 'Contacté par MOVA',
  [RentalInquiryStatus.CONFIRMED]: 'Confirmée',
  [RentalInquiryStatus.IN_PROGRESS]: 'En cours',
  [RentalInquiryStatus.RETURNED]: 'Retournée',
  [RentalInquiryStatus.PAID]: 'Payée',
  [RentalInquiryStatus.CLOSED]: 'Annulée',
};

const LOGISTICS_LABELS: Record<RentalLogisticsMode, string> = {
  [RentalLogisticsMode.SELF_PASSENGER]: MARKET_RDC.rental.logisticsModes.SELF_PASSENGER.label,
  [RentalLogisticsMode.PASSENGER_DRIVER]: MARKET_RDC.rental.logisticsModes.PASSENGER_DRIVER.label,
  [RentalLogisticsMode.OWNER_DRIVER]: MARKET_RDC.rental.logisticsModes.OWNER_DRIVER.label,
  [RentalLogisticsMode.MOVA_DRIVER]: MARKET_RDC.rental.logisticsModes.MOVA_DRIVER.label,
};

const PASSENGER_LOGISTICS_MODES: RentalLogisticsMode[] = [
  RentalLogisticsMode.SELF_PASSENGER,
  RentalLogisticsMode.PASSENGER_DRIVER,
  RentalLogisticsMode.MOVA_DRIVER,
];

const OWNER_LOGISTICS_MODES: RentalLogisticsMode[] = [
  RentalLogisticsMode.SELF_PASSENGER,
  RentalLogisticsMode.OWNER_DRIVER,
];

type RentalLogisticsFields = {
  logisticsMode: RentalLogisticsMode;
  passengerDriverName: string | null;
  passengerDriverPhone: string | null;
  ownerDriverName: string | null;
  ownerDriverPhone: string | null;
  driverId: string | null;
};

@Injectable()
export class RentalService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private promo: PromoService,
    private tripShare: TripShareService,
  ) {}

  private returnUpdateData(inquiry: { completionPin?: string | null }) {
    return {
      status: RentalInquiryStatus.RETURNED,
      completionPin: inquiry.completionPin ?? this.tripShare.generateCompletionPin(),
    };
  }

  /** Génère le PIN espèces si la location est retournée sans PIN (réservations antérieures à la migration). */
  async ensureCompletionPinForPayment<T extends { id: string; status: RentalInquiryStatus; completionPin?: string | null }>(
    inquiry: T,
  ): Promise<T> {
    if (inquiry.status !== RentalInquiryStatus.RETURNED || inquiry.completionPin) {
      return inquiry;
    }
    const updated = await this.prisma.rentalInquiry.update({
      where: { id: inquiry.id },
      data: { completionPin: this.tripShare.generateCompletionPin() },
      include: { vehicle: true },
    });
    return updated as unknown as T;
  }

  private normalizeCategory(raw?: string): string | undefined {
    if (!raw) return undefined;
    const key = raw.trim().toLowerCase();
    return CATEGORY_ALIASES[key] ?? raw.trim().toUpperCase();
  }

  private validateDates(startDate: Date, endDate: Date, rentalPeriod?: string) {
    if (endDate <= startDate) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'La date de fin doit être après la date de début.',
      );
    }
    const period = (rentalPeriod ?? 'DAILY').toUpperCase();
    if (period === 'HOURLY') {
      const hours = this.rentalHours(startDate, endDate);
      if (hours < MARKET_RDC.rental.minHourlyDurationHours) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          `Durée minimale : ${MARKET_RDC.rental.minHourlyDurationHours} heure.`,
        );
      }
      if (hours > MARKET_RDC.rental.maxHourlyDurationHours) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          `Durée maximale à l'heure : ${MARKET_RDC.rental.maxHourlyDurationHours} h. Choisissez le tarif journée au-delà.`,
        );
      }
    }
  }

  private rentalHours(startDate: Date, endDate: Date): number {
    return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (3600 * 1000)));
  }

  private rentalDays(startDate: Date, endDate: Date): number {
    return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)));
  }

  private resolveHourlyRateCdf(vehicle: { dailyRateCdf: number; hourlyRateCdf?: number | null }): number {
    if (vehicle.hourlyRateCdf != null && vehicle.hourlyRateCdf > 0) {
      return vehicle.hourlyRateCdf;
    }
    return Math.ceil(vehicle.dailyRateCdf / MARKET_RDC.rental.hoursPerDayForHourlyRate);
  }

  private computeOwnerNetCdf(grossCdf: number | null | undefined, depositCdf = 0): number | null {
    if (grossCdf == null || grossCdf <= 0) return null;
    const subtotal = Math.max(0, grossCdf - depositCdf);
    if (subtotal <= 0) return null;
    return subtotal - Math.round(subtotal * RENTAL_OWNER_COMMISSION_PCT);
  }

  private computeLogisticsGrossCdf(): number {
    return MARKET_RDC.interCity.baseSurchargeCdf * 2;
  }

  private computeDriverLogisticsNetCdf(): number {
    const gross = this.computeLogisticsGrossCdf();
    return gross - Math.round(gross * RENTAL_OWNER_COMMISSION_PCT);
  }

  private isPartnerOwned(inquiry: { vehicle?: { ownerUserId: string | null } | null }): boolean {
    return !!inquiry.vehicle?.ownerUserId;
  }

  private needsMovaLogistics(mode: RentalLogisticsMode): boolean {
    return mode === RentalLogisticsMode.MOVA_DRIVER;
  }

  private mapLogisticsFields(row: RentalLogisticsFields) {
    return {
      logisticsMode: row.logisticsMode,
      logisticsModeLabel: LOGISTICS_LABELS[row.logisticsMode],
      needsMovaLogistics: this.needsMovaLogistics(row.logisticsMode),
      passengerDriverName: row.passengerDriverName,
      passengerDriverPhone: row.passengerDriverPhone,
      ownerDriverName: row.ownerDriverName,
      ownerDriverPhone: row.ownerDriverPhone,
      movaDriverId: row.driverId,
    };
  }

  private parsePassengerLogistics(dto: {
    logisticsMode?: string;
    passengerDriverName?: string;
    passengerDriverPhone?: string;
  }) {
    const mode = (dto.logisticsMode?.trim().toUpperCase() ??
      RentalLogisticsMode.SELF_PASSENGER) as RentalLogisticsMode;
    if (!PASSENGER_LOGISTICS_MODES.includes(mode)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Mode logistique passager invalide.',
      );
    }
    const passengerDriverName = dto.passengerDriverName?.trim() || null;
    const passengerDriverPhone = dto.passengerDriverPhone?.trim() || null;
    if (mode === RentalLogisticsMode.PASSENGER_DRIVER && !passengerDriverPhone) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Téléphone du chauffeur passager requis.',
      );
    }
    return { logisticsMode: mode, passengerDriverName, passengerDriverPhone };
  }

  private parseOwnerLogistics(dto: {
    logisticsMode: string;
    ownerDriverName?: string;
    ownerDriverPhone?: string;
  }) {
    const mode = dto.logisticsMode.trim().toUpperCase() as RentalLogisticsMode;
    if (!OWNER_LOGISTICS_MODES.includes(mode)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Mode logistique propriétaire invalide.',
      );
    }
    const ownerDriverName = dto.ownerDriverName?.trim() || null;
    const ownerDriverPhone = dto.ownerDriverPhone?.trim() || null;
    if (mode === RentalLogisticsMode.OWNER_DRIVER && !ownerDriverPhone) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Téléphone du chauffeur propriétaire requis.',
      );
    }
    return { logisticsMode: mode, ownerDriverName, ownerDriverPhone };
  }

  private assertAdminRentalStatusChange(
    inquiry: { status: RentalInquiryStatus; vehicle?: { ownerUserId: string | null } | null },
    newStatus: RentalInquiryStatus,
    forceOverride?: boolean,
  ) {
    if (!this.isPartnerOwned(inquiry) || forceOverride) return;
    const ownerManaged: RentalInquiryStatus[] = [
      RentalInquiryStatus.PENDING,
      RentalInquiryStatus.CONTACTED,
      RentalInquiryStatus.CONFIRMED,
      RentalInquiryStatus.IN_PROGRESS,
      RentalInquiryStatus.RETURNED,
    ];
    if (ownerManaged.includes(newStatus)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Ce statut est géré par le propriétaire (ou le chauffeur logistique). Utilisez forceOverride pour un cas exceptionnel MOVA.',
      );
    }
  }

  private async publishRentalBooking(
    inquiry: {
      id: string;
      userId: string;
      status: RentalInquiryStatus;
      vehicleType: string;
      startDate: Date;
      endDate: Date;
      pickupAddress: string | null;
      pickupCity: string | null;
      returnCity: string | null;
      contactPhone: string | null;
      totalCdf: number | null;
      estimatedPriceCdf: number | null;
    },
    vehicle: { ownerUserId: string | null; name: string } | null | undefined,
    kind: RentalBookingEventKind,
    extra?: { logisticsSummary?: string },
  ) {
    const ownerUserId = vehicle?.ownerUserId;
    if (!ownerUserId) return;
    const passenger = await fetchAuthUserBrief(inquiry.userId);
    await this.redis.publish(MOVA_EVENTS.RENTAL_BOOKING, {
      kind,
      inquiryId: inquiry.id,
      ownerUserId,
      passengerId: inquiry.userId,
      passengerName: passenger?.name,
      passengerPhone: inquiry.contactPhone ?? passenger?.phone,
      vehicleName: vehicle?.name ?? inquiry.vehicleType,
      pickupCity: inquiry.pickupCity,
      returnCity: inquiry.returnCity,
      pickupAddress: inquiry.pickupAddress,
      startDate: inquiry.startDate.toISOString(),
      endDate: inquiry.endDate.toISOString(),
      priceCdf: inquiry.totalCdf ?? inquiry.estimatedPriceCdf,
      status: inquiry.status,
      ...extra,
    });
  }

  private async enrichOwnerBooking(inquiry: {
    id: string;
    userId: string;
    driverId: string | null;
    status: RentalInquiryStatus;
    vehicleId: string | null;
    vehicleType: string;
    startDate: Date;
    endDate: Date;
    pickupAddress: string | null;
    pickupCity: string | null;
    returnCity: string | null;
    contactPhone: string | null;
    notes: string | null;
    totalCdf: number | null;
    estimatedPriceCdf: number | null;
    rentalPeriod: string;
    createdAt: Date;
    logisticsMode: RentalLogisticsMode;
    passengerDriverName: string | null;
    passengerDriverPhone: string | null;
    ownerDriverName: string | null;
    ownerDriverPhone: string | null;
    vehicle?: { name: string } | null;
  }) {
    const passenger = await fetchAuthUserBrief(inquiry.userId);
    const grossCdf = inquiry.totalCdf ?? inquiry.estimatedPriceCdf;
    const depositCdf = (inquiry as { vehicle?: { depositCdf?: number } | null }).vehicle?.depositCdf ?? 0;
    const ownerNetCdf = this.computeOwnerNetCdf(grossCdf, depositCdf);
    const showRemaining =
      inquiry.status === RentalInquiryStatus.CONFIRMED ||
      inquiry.status === RentalInquiryStatus.IN_PROGRESS ||
      inquiry.status === RentalInquiryStatus.RETURNED;
    const remaining = showRemaining
      ? formatRentalRemaining(inquiry.endDate, new Date(), { rentalPeriod: inquiry.rentalPeriod })
      : null;
    return {
      id: inquiry.id,
      status: inquiry.status,
      statusLabel: RENTAL_STATUS_LABELS[inquiry.status],
      nextStepHint: this.getNextStepHint(inquiry, 'owner'),
      vehicleName: inquiry.vehicle?.name ?? inquiry.vehicleType,
      vehicleId: inquiry.vehicleId,
      passengerName: passenger?.name,
      passengerPhone: inquiry.contactPhone ?? passenger?.phone,
      pickupCity: inquiry.pickupCity,
      returnCity: inquiry.returnCity,
      pickupAddress: inquiry.pickupAddress,
      startDate: inquiry.startDate.toISOString(),
      endDate: inquiry.endDate.toISOString(),
      rentalPeriod: inquiry.rentalPeriod,
      grossCdf,
      ownerNetCdf,
      priceCdf: ownerNetCdf ?? grossCdf,
      displayAmountCdf: ownerNetCdf ?? grossCdf,
      displayAmountLabel: 'Votre gain net',
      notes: inquiry.notes,
      createdAt: inquiry.createdAt.toISOString(),
      driverId: inquiry.driverId,
      paymentReady: inquiry.status === RentalInquiryStatus.RETURNED,
      canConfirmCash: inquiry.status === RentalInquiryStatus.RETURNED,
      isPaid: inquiry.status === RentalInquiryStatus.PAID,
      remainingLabel: remaining?.remainingLabel ?? null,
      remainingActive: remaining?.isActive ?? false,
      ...this.mapLogisticsFields(inquiry),
    };
  }

  private mapVehicle(
    row: {
    id: string;
    name: string;
    make: string | null;
    model: string | null;
    year: number | null;
    category: string;
    transmission: string;
    city: string;
    seats: number;
    dailyRateCdf: number;
    hourlyRateCdf?: number | null;
    depositCdf: number;
    weeklyDiscountPct: number;
    rating: number;
    ownerName: string | null;
    ownerBadge: string | null;
    features: unknown;
    cancellationPolicy: string | null;
    mileageUnlimited: boolean;
    limitedMileageFeeCdf: number;
    imageUrl: string | null;
  },
    unavailableIds?: Set<string>,
  ) {
    const features = Array.isArray(row.features) ? row.features : [];
    const isAvailable = !unavailableIds?.has(row.id);
    return {
      id: row.id,
      name: row.name,
      make: row.make,
      model: row.model,
      year: row.year,
      category: row.category,
      categoryLabel: this.categoryLabel(row.category),
      transmission: row.transmission,
      transmissionLabel: row.transmission === 'AUTO' ? 'Automatique' : 'Manuelle',
      city: row.city,
      seats: row.seats,
      dailyRateCdf: row.dailyRateCdf,
      hourlyRateCdf: this.resolveHourlyRateCdf(row),
      depositCdf: row.depositCdf,
      weeklyDiscountPct: row.weeklyDiscountPct,
      rating: row.rating,
      ownerName: row.ownerName,
      ownerBadge: row.ownerBadge,
      features,
      cancellationPolicy: row.cancellationPolicy ?? MARKET_RDC.rental.cancellationPolicyDefault,
      mileageUnlimited: row.mileageUnlimited,
      limitedMileageFeeCdf: row.limitedMileageFeeCdf,
      imageUrl: row.imageUrl ?? `https://placehold.co/600x400/6C63FF/white?text=${encodeURIComponent(row.name)}`,
      isAvailable,
      availabilityLabel: isAvailable ? 'Disponible' : 'En location',
    };
  }

  private async getUnavailableVehicleIds(now = new Date()): Promise<Set<string>> {
    const rows = await this.prisma.rentalInquiry.findMany({
      where: {
        vehicleId: { not: null },
        status: { in: [RentalInquiryStatus.CONFIRMED, RentalInquiryStatus.IN_PROGRESS] },
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: { vehicleId: true },
    });
    return new Set(rows.map((r) => r.vehicleId).filter((id): id is string => Boolean(id)));
  }

  private async assertVehicleAvailableForDates(vehicleId: string, startDate: Date, endDate: Date) {
    const conflict = await this.prisma.rentalInquiry.findFirst({
      where: {
        vehicleId,
        status: { in: [RentalInquiryStatus.CONFIRMED, RentalInquiryStatus.IN_PROGRESS] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Ce véhicule est déjà réservé pour ces dates.',
      );
    }
  }

  private mapAddOnOptions(features: unknown) {
    const builtInGps = vehicleHasBuiltInGps(features);
    const { childSeat, gps, extraDriver } = MARKET_RDC.rental.addOns;
    return {
      childSeat: { ...childSeat, included: false },
      gps: {
        ...gps,
        included: builtInGps,
        priceCdf: builtInGps ? 0 : gps.priceCdf,
        label: builtInGps ? `${gps.label} (intégré au véhicule)` : gps.label,
      },
      extraDriver: { ...extraDriver, included: false },
    };
  }

  private categoryLabel(category: string): string {
    switch (category.toUpperCase()) {
      case 'ECONOMY':
        return 'Économique';
      case 'SUV':
        return 'SUV';
      case 'PREMIUM':
        return 'Premium';
      case 'VAN':
        return 'Utilitaire';
      default:
        return category;
    }
  }

  private buildSort(sort?: string): Prisma.RentalVehicleOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_desc':
        return [{ dailyRateCdf: 'desc' }];
      case 'rating':
        return [{ rating: 'desc' }, { dailyRateCdf: 'asc' }];
      case 'category':
        return [{ category: 'asc' }, { dailyRateCdf: 'asc' }];
      case 'price_asc':
      default:
        return [{ dailyRateCdf: 'asc' }];
    }
  }

  async listVehicles(query: RentalVehicleQueryDto = {}) {
    const category = this.normalizeCategory(query.category);
    const where: Prisma.RentalVehicleWhereInput = {
      isActive: true,
      approvalStatus: RentalVehicleApprovalStatus.APPROVED,
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
      ...(query.transmission ? { transmission: query.transmission } : {}),
      ...(query.minPrice != null || query.maxPrice != null
        ? {
            dailyRateCdf: {
              ...(query.minPrice != null ? { gte: query.minPrice } : {}),
              ...(query.maxPrice != null ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.rentalVehicle.findMany({
      where,
      orderBy: this.buildSort(query.sort),
    });
    const unavailableIds = await this.getUnavailableVehicleIds();
    return {
      data: rows.map((r) => this.mapVehicle(r, unavailableIds)),
      currency: MARKET_RDC.currency,
      filters: {
        categories: ['ECONOMY', 'SUV', 'PREMIUM', 'VAN'],
        transmissions: ['AUTO', 'MANUAL'],
        sortOptions: [
          { id: 'price_asc', label: 'Prix croissant' },
          { id: 'price_desc', label: 'Prix décroissant' },
          { id: 'rating', label: 'Meilleure note' },
          { id: 'category', label: 'Catégorie' },
        ],
      },
    };
  }

  async getVehicle(id: string) {
    const vehicle = await this.prisma.rentalVehicle.findUnique({ where: { id } });
    if (!vehicle || !vehicle.isActive) {
      throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const unavailableIds = await this.getUnavailableVehicleIds();
    return {
      vehicle: this.mapVehicle(vehicle, unavailableIds),
      options: {
        insuranceTiers: MARKET_RDC.rental.insuranceTiers,
        addOns: this.mapAddOnOptions(vehicle.features),
        rentalPeriods: [
          { id: 'HOURLY', label: 'À l\'heure', maxHours: MARKET_RDC.rental.maxHourlyDurationHours },
          { id: 'DAILY', label: 'À la journée' },
          { id: 'WEEKLY', label: 'À la semaine', discountPct: MARKET_RDC.rental.weeklyDiscountPct },
        ],
        mileageTypes: [
          {
            id: 'LIMITED',
            label: `Limité (${MARKET_RDC.rental.limitedMileageKmPerDay} km/j · ${MARKET_RDC.rental.limitedMileageKmPerHour} km/h)`,
            feeCdf: 0,
          },
          {
            id: 'UNLIMITED',
            label: 'Kilométrage illimité',
            surchargeCdf: MARKET_RDC.rental.unlimitedMileageSurchargeCdf,
          },
        ],
      },
      currency: MARKET_RDC.currency,
    };
  }

  computeQuote(
    vehicle: {
      dailyRateCdf: number;
      hourlyRateCdf?: number | null;
      depositCdf: number;
      weeklyDiscountPct: number;
      limitedMileageFeeCdf: number;
      category: string;
      name: string;
      seats: number;
      features?: unknown;
    },
    dto: RentalQuoteDto,
    startDate: Date,
    endDate: Date,
  ) {
    let rentalPeriod = (dto.rentalPeriod ?? 'DAILY').toUpperCase();
    const mileageType = dto.mileageType ?? 'UNLIMITED';
    const insuranceTier = (dto.insuranceTier ?? 'BASIC') as keyof typeof MARKET_RDC.rental.insuranceTiers;
    const addOns = (dto.addOns ?? {}) as RentalAddOns;
    const pickupCity = dto.pickupCity?.trim();
    const returnCity = dto.returnCity?.trim() ?? pickupCity;

    let days = 0;
    let hours = 0;
    let rentalFeeCdf = 0;
    let weeklyDiscountCdf = 0;

    if (rentalPeriod === 'HOURLY') {
      hours = this.rentalHours(startDate, endDate);
      rentalFeeCdf = this.resolveHourlyRateCdf(vehicle) * hours;
    } else {
      days = this.rentalDays(startDate, endDate);
      if (rentalPeriod === 'WEEKLY' && days < 7) {
        rentalPeriod = 'DAILY';
      }
      rentalFeeCdf = vehicle.dailyRateCdf * days;
      if (rentalPeriod === 'WEEKLY' && days >= 7) {
        const discountPct = vehicle.weeklyDiscountPct ?? MARKET_RDC.rental.weeklyDiscountPct;
        weeklyDiscountCdf = Math.round(rentalFeeCdf * (discountPct / 100));
        rentalFeeCdf -= weeklyDiscountCdf;
      }
    }

    const tier = MARKET_RDC.rental.insuranceTiers[insuranceTier] ?? MARKET_RDC.rental.insuranceTiers.BASIC;
    const insuranceFeeCdf = Math.round(rentalFeeCdf * (tier.surchargePct / 100));

    let addOnsFeeCdf = 0;
    const addOnDetails: { id: string; label: string; priceCdf: number }[] = [];
    for (const [key, selected] of Object.entries(addOns)) {
      if (!selected) continue;
      if (key === 'gps' && !shouldChargeGpsAddOn(vehicle.features, addOns)) continue;
      const cfg = MARKET_RDC.rental.addOns[key as keyof typeof MARKET_RDC.rental.addOns];
      if (!cfg) continue;
      const priceCdf =
        key === 'gps' && vehicleHasBuiltInGps(vehicle.features) ? 0 : cfg.priceCdf;
      addOnsFeeCdf += priceCdf;
      addOnDetails.push({
        id: key,
        label: key === 'gps' && vehicleHasBuiltInGps(vehicle.features) ? `${cfg.label} (inclus)` : cfg.label,
        priceCdf,
      });
    }

    let interCityFeeCdf = 0;
    if (pickupCity && returnCity && pickupCity.toLowerCase() !== returnCity.toLowerCase()) {
      interCityFeeCdf = MARKET_RDC.interCity.baseSurchargeCdf;
    }

    let mileageFeeCdf = 0;
    if (mileageType === 'UNLIMITED') {
      mileageFeeCdf =
        vehicle.limitedMileageFeeCdf ??
        MARKET_RDC.rental.unlimitedMileageSurchargeCdf;
    }

    const depositCdf = vehicle.depositCdf;
    const subtotalCdf = rentalFeeCdf + insuranceFeeCdf + addOnsFeeCdf + interCityFeeCdf + mileageFeeCdf;
    const totalCdf = subtotalCdf + depositCdf;

    return {
      vehicle: { id: dto.vehicleId, name: vehicle.name, category: vehicle.category, seats: vehicle.seats },
      days,
      hours,
      rentalPeriod,
      mileageType,
      insuranceTier,
      insuranceLabel: tier.label,
      pickupCity: pickupCity ?? null,
      returnCity: returnCity ?? null,
      breakdown: {
        rentalFeeCdf,
        weeklyDiscountCdf,
        insuranceFeeCdf,
        addOnsFeeCdf,
        addOnDetails,
        interCityFeeCdf,
        mileageFeeCdf,
        depositCdf,
        subtotalCdf,
      },
      rentalFeeCdf,
      depositCdf,
      estimatedPriceCdf: totalCdf,
      totalCdf,
      formatted: formatCdf(totalCdf),
      formattedSubtotal: formatCdf(subtotalCdf),
      currency: MARKET_RDC.currency,
    };
  }

  async quote(dto: RentalQuoteDto, redeemPromo = false) {
    const vehicle = await this.prisma.rentalVehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || !vehicle.isActive) {
      throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDates(startDate, endDate, dto.rentalPeriod);
    const base = await this.computeQuote(vehicle, dto, startDate, endDate);
    if (!dto.promoCode?.trim()) {
      return { ...base, promoCode: null as string | null, discountCdf: 0 };
    }
    const promoApplied = await applyPromoCode(this.promo, base.breakdown.subtotalCdf, dto.promoCode, redeemPromo, {
      context: { serviceType: 'RENTAL', rentalOwnerUserId: vehicle.ownerUserId ?? undefined },
      parts: { rentalSubtotalCdf: base.breakdown.subtotalCdf },
    });
    const totalCdf = promoApplied.estimatedPriceCdf + base.depositCdf;
    return {
      ...base,
      totalCdf,
      estimatedPriceCdf: totalCdf,
      formatted: formatCdf(totalCdf),
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      breakdown: { ...base.breakdown, subtotalCdf: promoApplied.estimatedPriceCdf, discountCdf: promoApplied.discountCdf },
    };
  }

  /** @deprecated Alias quote */
  async estimate(dto: RentalQuoteDto) {
    return this.quote(dto);
  }

  async createBooking(userId: string, dto: CreateRentalBookingDto) {
    const quoteResult = await this.quote(dto, true);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    await this.assertVehicleAvailableForDates(dto.vehicleId, startDate, endDate);
    const vehicle = await this.prisma.rentalVehicle.findUnique({ where: { id: dto.vehicleId } });
    const logistics = this.parsePassengerLogistics(dto);
    const inquiry = await this.prisma.rentalInquiry.create({
      data: {
        userId,
        status: RentalInquiryStatus.PENDING,
        vehicleId: dto.vehicleId,
        vehicleType: vehicle?.category ?? quoteResult.vehicle.category,
        startDate,
        endDate,
        pickupAddress: dto.pickupAddress,
        pickupCity: dto.pickupCity,
        returnCity: dto.returnCity ?? dto.pickupCity,
        rentalPeriod: dto.rentalPeriod ?? 'DAILY',
        mileageType: dto.mileageType ?? 'UNLIMITED',
        insuranceTier: dto.insuranceTier ?? 'BASIC',
        addOns: (dto.addOns ?? {}) as Prisma.InputJsonValue,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
        estimatedPriceCdf: quoteResult.totalCdf,
        totalCdf: quoteResult.totalCdf,
        promoCode: quoteResult.promoCode,
        discountCdf: quoteResult.discountCdf || undefined,
        logisticsMode: logistics.logisticsMode,
        passengerDriverName: logistics.passengerDriverName,
        passengerDriverPhone: logistics.passengerDriverPhone,
      },
      include: { vehicle: true },
    });
    await this.publishRentalBooking(inquiry, inquiry.vehicle, 'NEW_BOOKING');
    const logisticsHint =
      logistics.logisticsMode === RentalLogisticsMode.MOVA_DRIVER
        ? ' Un chauffeur MOVA pourra être assigné après confirmation du propriétaire.'
        : '';
    return {
      inquiry: this.enrichInquiry(inquiry),
      quote: quoteResult,
      message: `Demande enregistrée. Le propriétaire du véhicule a été notifié.${logisticsHint}`,
    };
  }

  async create(userId: string, dto: CreateRentalInquiryDto) {
    if (dto.vehicleId) return this.createBooking(userId, { ...dto, vehicleId: dto.vehicleId });
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDates(startDate, endDate, dto.rentalPeriod);
    const inquiry = await this.prisma.rentalInquiry.create({
      data: {
        userId,
        status: RentalInquiryStatus.PENDING,
        vehicleType: dto.vehicleType ?? 'ECONOMY',
        startDate,
        endDate,
        pickupAddress: dto.pickupAddress,
        pickupCity: dto.pickupCity,
        returnCity: dto.returnCity ?? dto.pickupCity,
        rentalPeriod: dto.rentalPeriod ?? 'DAILY',
        mileageType: dto.mileageType ?? 'UNLIMITED',
        insuranceTier: dto.insuranceTier ?? 'BASIC',
        addOns: dto.addOns as Prisma.InputJsonValue,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
      },
      include: { vehicle: true },
    });
    if (inquiry.vehicle?.ownerUserId) {
      await this.publishRentalBooking(inquiry, inquiry.vehicle, 'NEW_BOOKING');
    }
    return {
      inquiry: this.enrichInquiry(inquiry),
      message: inquiry.vehicle?.ownerUserId
        ? 'Demande enregistrée. Le propriétaire du véhicule a été notifié.'
        : 'Demande enregistrée. Un conseiller MOVA vous contactera sous 24h.',
    };
  }

  private enrichInquiry(
    inquiry: {
    id: string;
    userId: string;
    status: RentalInquiryStatus;
    vehicleId: string | null;
    vehicleType: string;
    startDate: Date;
    endDate: Date;
    pickupAddress: string | null;
    pickupCity: string | null;
    returnCity: string | null;
    rentalPeriod: string;
    mileageType: string;
    insuranceTier: string;
    addOns: unknown;
    contactPhone: string | null;
    notes: string | null;
    estimatedPriceCdf: number | null;
    totalCdf: number | null;
    logisticsMode: RentalLogisticsMode;
    passengerDriverName: string | null;
    passengerDriverPhone: string | null;
    ownerDriverName: string | null;
    ownerDriverPhone: string | null;
    driverId: string | null;
    completionPin?: string | null;
    createdAt: Date;
    updatedAt: Date;
    vehicle?: {
      name: string;
      ownerName: string | null;
      ownerContactPhone: string | null;
      ownerBadge: string | null;
      depositCdf?: number;
    } | null;
  },
    audience: 'passenger' | 'owner' | 'admin' | 'driver' = 'passenger',
  ) {
    const ownerContact =
      inquiry.status === RentalInquiryStatus.CONFIRMED ||
      inquiry.status === RentalInquiryStatus.CONTACTED ||
      inquiry.status === RentalInquiryStatus.IN_PROGRESS ||
      inquiry.status === RentalInquiryStatus.RETURNED
        ? inquiry.vehicle?.ownerContactPhone ?? MARKET_RDC.support.phone
        : null;
    const showRemaining =
      inquiry.status === RentalInquiryStatus.CONFIRMED ||
      inquiry.status === RentalInquiryStatus.IN_PROGRESS ||
      inquiry.status === RentalInquiryStatus.RETURNED;
    const remaining = showRemaining
      ? formatRentalRemaining(inquiry.endDate, new Date(), { rentalPeriod: inquiry.rentalPeriod })
      : null;
    const rentalDurationDays = inquiry.rentalPeriod === 'HOURLY'
      ? 0
      : Math.max(1, Math.ceil((inquiry.endDate.getTime() - inquiry.startDate.getTime()) / 86_400_000));
    const rentalDurationHours = inquiry.rentalPeriod === 'HOURLY'
      ? this.rentalHours(inquiry.startDate, inquiry.endDate)
      : 0;
    const cancelEligibility = canCancelRentalBooking({
      status: inquiry.status,
      startDate: inquiry.startDate,
    });
    const grossCdf = inquiry.totalCdf ?? inquiry.estimatedPriceCdf;
    const depositCdf = inquiry.vehicle?.depositCdf ?? 0;
    const rentalSubtotalCdf = Math.max(0, (grossCdf ?? 0) - depositCdf);
    const driverLogisticsNet =
      audience === 'driver' && inquiry.driverId && this.needsMovaLogistics(inquiry.logisticsMode)
        ? this.computeDriverLogisticsNetCdf()
        : null;
    const driverLogisticsGross =
      driverLogisticsNet != null ? this.computeLogisticsGrossCdf() : null;
    const displayAmountCdf =
      audience === 'owner'
        ? this.computeOwnerNetCdf(grossCdf, depositCdf) ?? grossCdf
        : audience === 'driver'
          ? driverLogisticsNet ?? grossCdf
          : grossCdf;
    const displayAmountLabel =
      audience === 'owner'
        ? 'Votre gain net'
        : audience === 'driver'
          ? 'Rémunération logistique'
          : 'Total à payer';
    return {
      ...inquiry,
      type: 'RENTAL',
      ...this.mapLogisticsFields(inquiry),
      priceCdf: grossCdf,
      depositCdf,
      rentalSubtotalCdf,
      passengerTotalCdf: grossCdf,
      displayAmountCdf,
      displayAmountLabel,
      ownerNetCdf:
        audience === 'owner' ? this.computeOwnerNetCdf(grossCdf, depositCdf) : undefined,
      driverGrossCdf: driverLogisticsGross ?? undefined,
      driverNetCdf: driverLogisticsNet ?? undefined,
      ownerContactPhone: ownerContact,
      ownerName: inquiry.vehicle?.ownerName,
      ownerBadge: inquiry.vehicle?.ownerBadge,
      statusLabel: RENTAL_STATUS_LABELS[inquiry.status],
      timeline: this.buildTimeline(inquiry.status),
      nextStepHint: this.getNextStepHint(inquiry, audience),
      canConfirmHandover: inquiry.status === RentalInquiryStatus.CONFIRMED,
      ...cancelEligibility,
      rentalDurationDays,
      rentalDurationHours,
      remainingMs: remaining?.remainingMs ?? 0,
      remainingDays: remaining?.remainingDays ?? 0,
      remainingHours: remaining?.remainingHours ?? 0,
      remainingLabel: remaining?.remainingLabel ?? null,
      remainingActive: remaining?.isActive ?? false,
      paymentReady: inquiry.status === RentalInquiryStatus.RETURNED,
      isPaid: inquiry.status === RentalInquiryStatus.PAID,
      paymentReferenceId: inquiry.id,
      completionPin:
        inquiry.status === RentalInquiryStatus.RETURNED || inquiry.status === RentalInquiryStatus.PAID
          ? inquiry.completionPin
          : undefined,
    };
  }

  private async enrichInquiryWithPayment(
    inquiry: {
      id: string;
      status: RentalInquiryStatus;
      completionPin?: string | null;
      [key: string]: unknown;
    },
    audience: 'passenger' | 'owner' | 'admin' | 'driver' = 'passenger',
  ) {
    const withPin =
      inquiry.status === RentalInquiryStatus.RETURNED || inquiry.status === RentalInquiryStatus.PAID
        ? await this.ensureCompletionPinForPayment(inquiry)
        : inquiry;
    const enriched = this.enrichInquiry(
      withPin as Parameters<RentalService['enrichInquiry']>[0],
      audience,
    ) as Record<string, unknown>;
    if (
      inquiry.status === RentalInquiryStatus.RETURNED ||
      inquiry.status === RentalInquiryStatus.PAID
    ) {
      const payment = await fetchServicePaymentStatus('RENTAL', inquiry.id);
      const isPaid = payment.isPaid || inquiry.status === RentalInquiryStatus.PAID;
      enriched.isPaid = isPaid;
      enriched.paymentReady = inquiry.status === RentalInquiryStatus.RETURNED && !isPaid;
    }
    return enriched;
  }

  private buildTimeline(current: RentalInquiryStatus) {
    const order = TIMELINE_STEPS.map((s) => s.status);
    const currentIdx =
      current === RentalInquiryStatus.CLOSED
        ? -1
        : current === RentalInquiryStatus.PAID
          ? order.length - 1
          : order.indexOf(current);
    return TIMELINE_STEPS.map((step, idx) => ({
      status: step.status,
      label: step.label,
      completed: currentIdx >= 0 && idx <= currentIdx,
      current: currentIdx >= 0 && idx === currentIdx,
    }));
  }

  private getNextStepHint(
    inquiry: {
      status: RentalInquiryStatus;
      logisticsMode?: RentalLogisticsMode;
      driverId?: string | null;
    },
    audience: 'passenger' | 'owner' | 'admin' | 'driver',
  ): string | null {
    const mode = inquiry.logisticsMode ?? RentalLogisticsMode.SELF_PASSENGER;
    switch (inquiry.status) {
      case RentalInquiryStatus.PENDING:
        if (audience === 'owner') {
          return 'Prenez en charge la demande, puis confirmez la disponibilité du véhicule.';
        }
        return 'Le propriétaire ou MOVA examine votre demande.';
      case RentalInquiryStatus.CONTACTED:
        if (audience === 'owner') {
          return 'Confirmez la disponibilité pour valider la réservation.';
        }
        return 'En attente de confirmation de disponibilité par le propriétaire.';
      case RentalInquiryStatus.CONFIRMED:
        if (audience === 'owner') {
          return 'À la remise du véhicule au passager, cliquez « Remise effectuée » : le statut passera à En cours.';
        }
        if (audience === 'driver') {
          return 'Rendez-vous sur place pour la remise du véhicule, puis appuyez sur « Remise effectuée ».';
        }
        if (audience === 'admin') {
          const movaPart =
            mode === RentalLogisticsMode.MOVA_DRIVER
              ? ' Le chauffeur MOVA assigné peut aussi activer « En cours » à la remise.'
              : '';
          return `« En cours » : remise par le propriétaire, confirmation passager, chauffeur MOVA, ou automatiquement à la date de début.${movaPart}`;
        }
        return 'Appuyez sur « J\'ai reçu le véhicule » à la remise, ou attendez le propriétaire / chauffeur MOVA. Sinon, passage automatique à En cours à la date de début.';
      case RentalInquiryStatus.IN_PROGRESS:
        if (audience === 'owner') {
          return 'À la fin de la location, cliquez « Véhicule rendu » pour enregistrer le retour.';
        }
        if (audience === 'driver') {
          return 'À la récupération du véhicule, appuyez sur « Véhicule rendu » pour clôturer la mission.';
        }
        return 'Location active — le retour sera confirmé par le propriétaire à la fin de la période.';
      case RentalInquiryStatus.RETURNED:
        return audience === 'passenger'
          ? 'Réglez la location pour obtenir votre reçu.'
          : audience === 'owner'
            ? 'Demandez le code PIN au passager et saisissez-le pour confirmer le paiement espèces.'
            : 'Location terminée — en attente du paiement passager.';
      case RentalInquiryStatus.PAID:
        return 'Location payée — reçu disponible dans l\'application MOVA.';
      case RentalInquiryStatus.CLOSED:
        return 'Réservation annulée ou refusée.';
      default:
        return null;
    }
  }

  private isRentalStartDue(inquiry: { status: RentalInquiryStatus; startDate: Date }): boolean {
    return inquiry.status === RentalInquiryStatus.CONFIRMED && inquiry.startDate.getTime() <= Date.now();
  }

  async transitionToInProgress(inquiry: {
    id: string;
    status: RentalInquiryStatus;
    userId: string;
  }) {
    if (inquiry.status === RentalInquiryStatus.IN_PROGRESS) {
      return this.prisma.rentalInquiry.findUniqueOrThrow({
        where: { id: inquiry.id },
        include: { vehicle: true },
      });
    }
    if (inquiry.status !== RentalInquiryStatus.CONFIRMED) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'La location doit être confirmée avant de passer en cours.',
      );
    }
    const updated = await this.prisma.rentalInquiry.update({
      where: { id: inquiry.id },
      data: { status: RentalInquiryStatus.IN_PROGRESS },
      include: { vehicle: true },
    });
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'RENTAL',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return updated;
  }

  private async maybeAutoStartInquiry<
    T extends { id: string; status: RentalInquiryStatus; startDate: Date; userId: string },
  >(inquiry: T): Promise<T> {
    if (!this.isRentalStartDue(inquiry)) return inquiry;
    return (await this.transitionToInProgress(inquiry)) as unknown as T;
  }

  async autoStartDueBookings(limit = 50): Promise<number> {
    const due = await this.prisma.rentalInquiry.findMany({
      where: {
        status: RentalInquiryStatus.CONFIRMED,
        startDate: { lte: new Date() },
      },
      orderBy: { startDate: 'asc' },
      take: limit,
      include: { vehicle: true },
    });
    let count = 0;
    for (const inquiry of due) {
      try {
        await this.transitionToInProgress(inquiry);
        count += 1;
      } catch {
        // ignore race / invalid row
      }
    }
    return count;
  }

  async list(userId: string) {
    const rows = await this.prisma.rentalInquiry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { vehicle: true },
    });
    const started = await Promise.all(rows.map((r) => this.maybeAutoStartInquiry(r)));
    return { data: started.map((r) => this.enrichInquiry(r)) };
  }

  async listBookings(userId: string) {
    const rows = await this.prisma.rentalInquiry.findMany({
      where: { userId, vehicleId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { vehicle: true },
    });
    const started = await Promise.all(rows.map((r) => this.maybeAutoStartInquiry(r)));
    return {
      data: await Promise.all(
        started.map((r) =>
          this.enrichInquiryWithPayment(r, 'passenger').then((inquiry) => ({
            ...inquiry,
            currency: MARKET_RDC.currency,
          })),
        ),
      ),
    };
  }

  async cancelBooking(id: string, userId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({
      where: { id },
      include: { vehicle: true },
    });
    if (!inquiry) {
      throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (inquiry.userId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const cancelEligibility = canCancelRentalBooking({
      status: inquiry.status,
      startDate: inquiry.startDate,
    });
    if (!cancelEligibility.canCancel) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        cancelEligibility.cancelBlockReason ?? 'Cette réservation ne peut plus être annulée.',
      );
    }
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: { status: RentalInquiryStatus.CLOSED },
      include: { vehicle: true },
    });
    await this.publishRentalBooking(updated, updated.vehicle, 'CANCELLED');
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'RENTAL',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return this.enrichInquiry(updated);
  }

  async passengerConfirmHandover(id: string, userId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({
      where: { id },
      include: { vehicle: true },
    });
    if (!inquiry) {
      throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (inquiry.userId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const updated = await this.transitionToInProgress(inquiry);
    return this.enrichInquiry(updated);
  }

  async ownerListBookings(
    ownerUserId: string,
    query?: { status?: string; vehicleId?: string; from?: string; to?: string; q?: string; skip?: number; take?: number },
  ) {
    const statuses = query?.status
      ? query.status.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const from = query?.from ? new Date(query.from) : undefined;
    const to = query?.to ? new Date(query.to) : undefined;
    const q = query?.q?.trim().toLowerCase();
    const skip = Math.max(query?.skip ?? 0, 0);
    const take = Math.min(Math.max(query?.take ?? 50, 1), 100);

    const rows = await this.prisma.rentalInquiry.findMany({
      where: {
        vehicle: { ownerUserId, ...(query?.vehicleId ? { id: query.vehicleId } : {}) },
        ...(statuses?.length ? { status: { in: statuses as RentalInquiryStatus[] } } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { vehicle: true },
    });
    let filtered = rows;
    if (q) {
      filtered = rows.filter((r) => {
        const hay = `${r.id} ${r.pickupCity ?? ''} ${r.returnCity ?? ''} ${r.pickupAddress ?? ''} ${r.vehicle?.name ?? ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const total = filtered.length;
    const page = filtered.slice(skip, skip + take);
    const started = await Promise.all(page.map((r) => this.maybeAutoStartInquiry(r)));
    return {
      data: await Promise.all(started.map((r) => this.enrichOwnerBooking(r))),
      pagination: { skip, take, total },
    };
  }

  async ownerGetBooking(ownerUserId: string, id: string) {
    const inquiry = await this.prisma.rentalInquiry.findFirst({
      where: { id, vehicle: { ownerUserId } },
      include: { vehicle: true },
    });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const started = await this.maybeAutoStartInquiry(inquiry);
    return this.enrichOwnerBooking(started);
  }

  async ownerUpdateBookingStatus(
    ownerUserId: string,
    id: string,
    action: 'acknowledge' | 'confirm' | 'decline' | 'start' | 'return',
  ) {
    const inquiry = await this.prisma.rentalInquiry.findFirst({
      where: { id, vehicle: { ownerUserId } },
      include: { vehicle: true },
    });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);

    let newStatus: RentalInquiryStatus;
    if (action === 'acknowledge') {
      if (inquiry.status !== RentalInquiryStatus.PENDING) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Seules les demandes en attente peuvent être prises en charge.');
      }
      newStatus = RentalInquiryStatus.CONTACTED;
    } else if (action === 'confirm') {
      if (inquiry.status !== RentalInquiryStatus.PENDING && inquiry.status !== RentalInquiryStatus.CONTACTED) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Impossible de confirmer cette demande.');
      }
      newStatus = RentalInquiryStatus.CONFIRMED;
    } else if (action === 'start') {
      const updated = await this.transitionToInProgress(inquiry);
      return this.enrichOwnerBooking(updated);
    } else if (action === 'return') {
      if (inquiry.status !== RentalInquiryStatus.IN_PROGRESS) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'La location doit être en cours pour enregistrer le retour.');
      }
      const updated = await this.prisma.rentalInquiry.update({
        where: { id },
        data: this.returnUpdateData(inquiry),
        include: { vehicle: true },
      });
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'RENTAL',
        referenceId: updated.id,
        userId: updated.userId,
        status: updated.status,
      });
      return this.enrichOwnerBooking(updated);
    } else {
      if (inquiry.status === RentalInquiryStatus.CLOSED || inquiry.status === RentalInquiryStatus.RETURNED) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Cette demande est déjà clôturée.');
      }
      newStatus = RentalInquiryStatus.CLOSED;
    }

    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: { status: newStatus },
      include: { vehicle: true },
    });
    if (updated.status !== inquiry.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'RENTAL',
        referenceId: updated.id,
        userId: updated.userId,
        status: updated.status,
      });
      if (action === 'decline') {
        await this.publishRentalBooking(updated, updated.vehicle, 'CANCELLED');
      }
    }
    return this.enrichOwnerBooking(updated);
  }

  async ownerUpdateLogistics(
    ownerUserId: string,
    id: string,
    dto: { logisticsMode: string; ownerDriverName?: string; ownerDriverPhone?: string },
  ) {
    const inquiry = await this.prisma.rentalInquiry.findFirst({
      where: { id, vehicle: { ownerUserId } },
      include: { vehicle: true },
    });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (
      inquiry.status === RentalInquiryStatus.CLOSED ||
      inquiry.status === RentalInquiryStatus.RETURNED ||
      inquiry.status === RentalInquiryStatus.IN_PROGRESS
    ) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Logistique non modifiable à ce stade.');
    }
    const logistics = this.parseOwnerLogistics(dto);
    const clearMovaDriver = inquiry.logisticsMode === RentalLogisticsMode.MOVA_DRIVER &&
      logistics.logisticsMode !== RentalLogisticsMode.MOVA_DRIVER;
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: {
        logisticsMode: logistics.logisticsMode,
        ownerDriverName: logistics.ownerDriverName,
        ownerDriverPhone: logistics.ownerDriverPhone,
        ...(clearMovaDriver || logistics.logisticsMode !== RentalLogisticsMode.MOVA_DRIVER
          ? { driverId: null }
          : {}),
      },
      include: { vehicle: true },
    });
    return this.enrichOwnerBooking(updated);
  }

  async get(id: string, userId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    const started = await this.maybeAutoStartInquiry(inquiry);
    const withPin = await this.ensureCompletionPinForPayment(started);
    return this.enrichInquiryWithPayment(withPin, 'passenger');
  }

  async getForParticipant(id: string, userId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.userId !== userId && inquiry.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const started = await this.maybeAutoStartInquiry(inquiry);
    const audience =
      inquiry.driverId === userId ? 'driver' : inquiry.userId === userId ? 'passenger' : 'admin';
    return this.enrichInquiryWithPayment(started, audience);
  }

  async listForDriver(driverId: string) {
    const rows = await this.prisma.rentalInquiry.findMany({
      where: {
        driverId,
        status: { notIn: [RentalInquiryStatus.CLOSED, RentalInquiryStatus.RETURNED] },
      },
      orderBy: { startDate: 'asc' },
      take: 20,
      include: { vehicle: true },
    });
    return {
      data: rows.map((r) => {
        const gross = r.totalCdf ?? r.estimatedPriceCdf ?? 0;
        const driverNet =
          r.logisticsMode === RentalLogisticsMode.MOVA_DRIVER ? this.computeDriverLogisticsNetCdf() : null;
        return {
          id: r.id,
          type: 'RENTAL',
          label: 'Location véhicule',
          status: r.status,
          pickupAddress: r.pickupAddress ?? r.pickupCity ?? '—',
          dropoffAddress: r.returnCity ?? r.pickupCity ?? '—',
          pickupCity: r.pickupCity,
          returnCity: r.returnCity,
          vehicleName: r.vehicle?.name ?? r.vehicleType,
          contactPhone: r.contactPhone,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          priceCdf: gross,
          passengerTotalCdf: gross,
          driverNetCdf: driverNet ?? undefined,
          driverGrossCdf: driverNet != null ? this.computeLogisticsGrossCdf() : undefined,
          logisticsModeLabel: LOGISTICS_LABELS[r.logisticsMode],
          createdAt: r.createdAt.toISOString(),
        };
      }),
    };
  }

  async updateStatusByDriver(id: string, driverId: string, status: RentalInquiryStatus) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.driverId !== driverId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const allowed: Record<RentalInquiryStatus, RentalInquiryStatus[]> = {
      [RentalInquiryStatus.PENDING]: [],
      [RentalInquiryStatus.CONTACTED]: [],
      [RentalInquiryStatus.CONFIRMED]: [RentalInquiryStatus.IN_PROGRESS],
      [RentalInquiryStatus.IN_PROGRESS]: [RentalInquiryStatus.RETURNED],
      [RentalInquiryStatus.RETURNED]: [],
      [RentalInquiryStatus.PAID]: [],
      [RentalInquiryStatus.CLOSED]: [],
    };
    if (!allowed[inquiry.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Transition de statut invalide.');
    }
    if (status === RentalInquiryStatus.IN_PROGRESS) {
      await assertDriverCanReceiveJobs(driverId);
      const updated = await this.transitionToInProgress(inquiry);
      const enriched = await this.enrichInquiryWithPayment(updated, 'driver');
      return { rental: enriched, inquiry: enriched };
    }
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data:
        status === RentalInquiryStatus.RETURNED
          ? this.returnUpdateData(inquiry)
          : { status },
      include: { vehicle: true },
    });
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'RENTAL',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    const enriched = await this.enrichInquiryWithPayment(updated, 'driver');
    return { rental: enriched, inquiry: enriched };
  }

  async markPaid(id: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.status === RentalInquiryStatus.PAID) {
      return this.enrichInquiry(inquiry);
    }
    if (inquiry.status !== RentalInquiryStatus.RETURNED) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Seule une location retournée peut être marquée payée.',
      );
    }
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: { status: RentalInquiryStatus.PAID },
      include: { vehicle: true },
    });
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'RENTAL',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return this.enrichInquiry(updated);
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.rentalInquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { vehicle: true },
    });
    return Promise.all(
      rows.map(async (r) => {
        const passenger = await fetchAuthUserBrief(r.userId);
        const driver = r.driverId ? await fetchAuthUserBrief(r.driverId) : null;
        return {
          id: r.id,
          userId: r.userId,
          passengerName: passenger?.name,
          passengerPhone: r.contactPhone ?? passenger?.phone,
          driverId: r.driverId,
          driverName: driver?.name,
          driverPhone: driver?.phone,
          status: r.status,
          nextStepHint: this.getNextStepHint(r, 'admin'),
          vehicleName: r.vehicle?.name ?? r.vehicleType,
          vehicleType: r.vehicleType,
          ownerName: r.vehicle?.ownerName,
          ownerContactPhone: r.vehicle?.ownerContactPhone,
          ownerUserId: r.vehicle?.ownerUserId ?? null,
          contactPhone: r.contactPhone,
          notes: r.notes,
          pickupCity: r.pickupCity,
          returnCity: r.returnCity,
          insuranceTier: r.insuranceTier,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          priceCdf: r.totalCdf ?? r.estimatedPriceCdf,
          estimatedPriceCdf: r.totalCdf ?? r.estimatedPriceCdf,
          createdAt: r.createdAt.toISOString(),
          ...this.mapLogisticsFields(r),
        };
      }),
    );
  }

  async adminAssignDriver(id: string, driverId: string) {
    if (!driverId?.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Chauffeur requis.');
    }
    await assertDriverEligibleForRentalLogistics(driverId.trim());
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.status === RentalInquiryStatus.CLOSED || inquiry.status === RentalInquiryStatus.RETURNED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Impossible d\'assigner sur cette demande.');
    }
    if (!this.needsMovaLogistics(inquiry.logisticsMode)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Aucun chauffeur MOVA requis pour ce mode logistique.',
      );
    }
    if (
      this.isPartnerOwned(inquiry) &&
      inquiry.status !== RentalInquiryStatus.CONFIRMED &&
      inquiry.status !== RentalInquiryStatus.IN_PROGRESS
    ) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Le propriétaire doit confirmer la disponibilité avant d\'assigner un chauffeur logistique.',
      );
    }
    const data: { driverId: string; status?: RentalInquiryStatus } = { driverId: driverId.trim() };
    if (
      !this.isPartnerOwned(inquiry) &&
      (inquiry.status === RentalInquiryStatus.PENDING || inquiry.status === RentalInquiryStatus.CONTACTED)
    ) {
      data.status = RentalInquiryStatus.CONFIRMED;
    }
    const updated = await this.prisma.rentalInquiry.update({ where: { id }, data, include: { vehicle: true } });
    const driver = await fetchAuthUserBrief(updated.driverId!);
    const logisticsSummary = `Livraison/récupération ${updated.vehicle?.name ?? updated.vehicleType}${
      updated.pickupCity ? ` · ${updated.pickupCity}` : ''
    }`;
    await this.redis.publish(MOVA_EVENTS.SERVICE_ASSIGNED, {
      serviceType: 'RENTAL',
      referenceId: updated.id,
      driverId: updated.driverId!,
      passengerId: updated.userId,
      summary: logisticsSummary,
      pickupCity: updated.pickupCity ?? undefined,
      returnCity: updated.returnCity ?? undefined,
    });
    await this.publishRentalBooking(updated, updated.vehicle, 'LOGISTICS_ASSIGNED', { logisticsSummary });
    if (updated.status !== inquiry.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'RENTAL',
        referenceId: updated.id,
        userId: updated.userId,
        status: updated.status,
      });
    }
    const passenger = await fetchAuthUserBrief(updated.userId);
    return {
      id: updated.id,
      driverId: updated.driverId,
      driverName: driver?.name,
      driverPhone: driver?.phone,
      passengerName: passenger?.name,
      passengerPhone: updated.contactPhone ?? passenger?.phone,
      status: updated.status,
    };
  }

  async adminCancel(id: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: { status: RentalInquiryStatus.CLOSED },
      include: { vehicle: true },
    });
    await this.publishRentalBooking(updated, updated.vehicle, 'CANCELLED');
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'RENTAL',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return this.enrichInquiry(updated);
  }

  async adminUpdateStatus(id: string, status: RentalInquiryStatus, forceOverride = false) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    this.assertAdminRentalStatusChange(inquiry, status, forceOverride);
    const updateData =
      status === RentalInquiryStatus.RETURNED ? this.returnUpdateData(inquiry) : { status };
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: updateData,
      include: { vehicle: true },
    });
    if (updated.status !== inquiry.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'RENTAL',
        referenceId: updated.id,
        userId: updated.userId,
        status: updated.status,
      });
      if (updated.status === RentalInquiryStatus.CONFIRMED) {
        await this.publishRentalBooking(updated, updated.vehicle, 'CONFIRMED');
      }
      if (updated.status === RentalInquiryStatus.CLOSED) {
        await this.publishRentalBooking(updated, updated.vehicle, 'CANCELLED');
      }
    }
    return this.enrichInquiry(updated);
  }

  async listVehiclesAdmin() {
    const rows = await this.prisma.rentalVehicle.findMany({ orderBy: [{ city: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => this.mapVehicleForAdmin(r));
  }

  mapVehicleForAdmin(row: {
    id: string;
    name: string;
    make: string | null;
    model: string | null;
    year: number | null;
    category: string;
    transmission: string;
    city: string;
    seats: number;
    dailyRateCdf: number;
    hourlyRateCdf?: number | null;
    depositCdf: number;
    weeklyDiscountPct: number;
    rating: number;
    ownerName: string | null;
    ownerBadge: string | null;
    ownerContactPhone: string | null;
    ownerUserId: string | null;
    approvalStatus: RentalVehicleApprovalStatus;
    features: unknown;
    cancellationPolicy: string | null;
    mileageUnlimited: boolean;
    limitedMileageFeeCdf: number;
    imageUrl: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...this.mapVehicle(row),
      isActive: row.isActive,
      ownerContactPhone: row.ownerContactPhone,
      ownerUserId: row.ownerUserId,
      approvalStatus: row.approvalStatus,
      approvalStatusLabel: this.approvalStatusLabel(row.approvalStatus),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private approvalStatusLabel(status: RentalVehicleApprovalStatus): string {
    switch (status) {
      case RentalVehicleApprovalStatus.PENDING:
        return 'En attente validation';
      case RentalVehicleApprovalStatus.APPROVED:
        return 'Approuvé';
      case RentalVehicleApprovalStatus.REJECTED:
        return 'Refusé';
      default:
        return status;
    }
  }

  async createVehicleForOwner(ownerUserId: string, data: Record<string, unknown>) {
    const payload = this.normalizeVehicleAdminPayload(data);
    const created = await this.prisma.rentalVehicle.create({
      data: {
        ...payload,
        ownerUserId,
        approvalStatus: RentalVehicleApprovalStatus.PENDING,
        isActive: false,
      },
    });
    const mapped = this.mapVehicleForAdmin(created);
    await this.publishPartnerVehicleEvent(ownerUserId, created.id, 'created', mapped);
    return mapped;
  }

  async updateVehicleForOwner(ownerUserId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.rentalVehicle.findFirst({ where: { id, ownerUserId } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const payload = this.normalizeVehicleAdminPayload({ ...existing, ...data });
    const isApproved = existing.approvalStatus === RentalVehicleApprovalStatus.APPROVED;
    const updated = await this.prisma.rentalVehicle.update({
      where: { id },
      data: isApproved
        ? {
            dailyRateCdf: payload.dailyRateCdf,
            hourlyRateCdf: payload.hourlyRateCdf ?? null,
            depositCdf: payload.depositCdf,
            imageUrl: payload.imageUrl,
            features: payload.features,
          }
        : {
            ...payload,
            approvalStatus: RentalVehicleApprovalStatus.PENDING,
            isActive: false,
          },
    });
    const mapped = this.mapVehicleForAdmin(updated);
    await this.publishPartnerVehicleEvent(ownerUserId, id, 'updated', mapped);
    return mapped;
  }

  private async publishPartnerVehicleEvent(
    ownerUserId: string,
    vehicleId: string,
    action: 'created' | 'updated' | 'deleted' | 'reviewed',
    vehicle?: { approvalStatus?: string; isActive?: boolean },
  ) {
    await this.redis.publish(MOVA_EVENTS.RENTAL_PARTNER_VEHICLE, {
      vehicleId,
      ownerUserId,
      action,
      approvalStatus: vehicle?.approvalStatus,
      isActive: vehicle?.isActive,
    });
  }

  async upsertVehicleAdmin(id: string | null, data: Record<string, unknown>) {
    if (id) {
      const existing = await this.prisma.rentalVehicle.findUnique({ where: { id } });
      if (!existing) throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
      const merged = this.mergeVehicleAdminPayload(existing, data);
      const payload = this.normalizeVehicleAdminPayload(merged);
      const updated = await this.prisma.rentalVehicle.update({ where: { id }, data: payload });
      const mapped = this.mapVehicleForAdmin(updated);
      if (updated.ownerUserId) {
        const reviewed =
          existing.approvalStatus !== updated.approvalStatus || existing.isActive !== updated.isActive;
        await this.publishPartnerVehicleEvent(
          updated.ownerUserId,
          id,
          reviewed ? 'reviewed' : 'updated',
          mapped,
        );
      }
      return mapped;
    }
    const payload = this.normalizeVehicleAdminPayload(data);
    const created = await this.prisma.rentalVehicle.create({ data: payload });
    const mapped = this.mapVehicleForAdmin(created);
    if (created.ownerUserId) {
      await this.publishPartnerVehicleEvent(created.ownerUserId, created.id, 'created', mapped);
    }
    return mapped;
  }

  /** Fusionne un PATCH partiel (ex. approbation admin) avec l'enregistrement existant. */
  private mergeVehicleAdminPayload(
    existing: {
      name: string;
      make: string | null;
      model: string | null;
      year: number | null;
      category: string;
      transmission: string;
      city: string;
    seats: number;
    dailyRateCdf: number;
    hourlyRateCdf?: number | null;
    depositCdf: number;
      weeklyDiscountPct: number;
      rating: number;
      ownerName: string | null;
      ownerBadge: string | null;
      ownerContactPhone: string | null;
      ownerUserId: string | null;
      approvalStatus: RentalVehicleApprovalStatus;
      features: unknown;
      cancellationPolicy: string | null;
      mileageUnlimited: boolean;
      limitedMileageFeeCdf: number;
      imageUrl: string | null;
      isActive: boolean;
    },
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      name: existing.name,
      make: existing.make,
      model: existing.model,
      year: existing.year,
      category: existing.category,
      transmission: existing.transmission,
      city: existing.city,
      seats: existing.seats,
      dailyRateCdf: existing.dailyRateCdf,
      depositCdf: existing.depositCdf,
      weeklyDiscountPct: existing.weeklyDiscountPct,
      rating: existing.rating,
      ownerName: existing.ownerName,
      ownerBadge: existing.ownerBadge,
      ownerContactPhone: existing.ownerContactPhone,
      ownerUserId: existing.ownerUserId,
      approvalStatus: existing.approvalStatus,
      features: existing.features,
      cancellationPolicy: existing.cancellationPolicy,
      mileageUnlimited: existing.mileageUnlimited,
      limitedMileageFeeCdf: existing.limitedMileageFeeCdf,
      imageUrl: existing.imageUrl,
      isActive: existing.isActive,
      ...patch,
    };
  }

  async deleteVehicleForOwner(ownerUserId: string, id: string) {
    const existing = await this.prisma.rentalVehicle.findFirst({ where: { id, ownerUserId } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const activeBooking = await this.prisma.rentalInquiry.findFirst({
      where: {
        vehicleId: id,
        status: {
          in: [
            RentalInquiryStatus.PENDING,
            RentalInquiryStatus.CONTACTED,
            RentalInquiryStatus.CONFIRMED,
            RentalInquiryStatus.IN_PROGRESS,
            RentalInquiryStatus.RETURNED,
          ],
        },
      },
    });
    if (activeBooking) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Impossible de retirer ce véhicule : une réservation est en cours.',
      );
    }
    const updated = await this.prisma.rentalVehicle.update({
      where: { id },
      data: { isActive: false },
    });
    await this.publishPartnerVehicleEvent(ownerUserId, id, 'deleted', {
      approvalStatus: updated.approvalStatus,
      isActive: updated.isActive,
    });
    return { id: updated.id, isActive: updated.isActive, message: 'Véhicule retiré du catalogue.' };
  }

  async getVehicleForOwner(ownerUserId: string, id: string) {
    const row = await this.prisma.rentalVehicle.findFirst({ where: { id, ownerUserId } });
    if (!row) throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return this.mapVehicleForAdmin(row);
  }

  async deleteVehicleAdmin(id: string) {
    const existing = await this.prisma.rentalVehicle.findUnique({ where: { id } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updated = await this.prisma.rentalVehicle.update({ where: { id }, data: { isActive: false } });
    return { id: updated.id, isActive: updated.isActive };
  }

  private normalizeVehicleAdminPayload(data: Record<string, unknown>): Prisma.RentalVehicleCreateInput {
    const name = String(data.name ?? '').trim();
    if (!name) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Nom du véhicule requis.');
    const category = this.normalizeCategory(String(data.category ?? 'ECONOMY')) ?? 'ECONOMY';
    const dailyRateCdf = Number(data.dailyRateCdf ?? 0);
    if (!Number.isFinite(dailyRateCdf) || dailyRateCdf <= 0) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Tarif journalier invalide.');
    }
    const seats = Number(data.seats ?? 5);
    const features = Array.isArray(data.features)
      ? data.features.map((f) => String(f))
      : typeof data.features === 'string' && data.features.trim()
        ? data.features.split(',').map((f) => f.trim()).filter(Boolean)
        : undefined;
    return {
      name,
      make: data.make != null ? String(data.make) : undefined,
      model: data.model != null ? String(data.model) : undefined,
      year: data.year != null ? Number(data.year) : undefined,
      category,
      transmission: String(data.transmission ?? 'MANUAL').toUpperCase() === 'AUTO' ? 'AUTO' : 'MANUAL',
      city: String(data.city ?? 'Kinshasa').trim() || 'Kinshasa',
      seats: Number.isFinite(seats) && seats > 0 ? seats : 5,
      dailyRateCdf: Math.round(dailyRateCdf),
      ...(data.hourlyRateCdf != null && Number(data.hourlyRateCdf) > 0
        ? { hourlyRateCdf: Math.round(Number(data.hourlyRateCdf)) }
        : {}),
      depositCdf: data.depositCdf != null ? Math.round(Number(data.depositCdf)) : 50000,
      weeklyDiscountPct: data.weeklyDiscountPct != null ? Math.round(Number(data.weeklyDiscountPct)) : 10,
      rating: data.rating != null ? Number(data.rating) : 4.5,
      ownerName: data.ownerName != null ? String(data.ownerName) : undefined,
      ownerBadge: data.ownerBadge != null ? String(data.ownerBadge) : undefined,
      ownerContactPhone: data.ownerContactPhone != null ? String(data.ownerContactPhone) : undefined,
      features: features ?? undefined,
      cancellationPolicy: data.cancellationPolicy != null ? String(data.cancellationPolicy) : undefined,
      mileageUnlimited: data.mileageUnlimited !== false,
      limitedMileageFeeCdf:
        data.limitedMileageFeeCdf != null ? Math.round(Number(data.limitedMileageFeeCdf)) : 15000,
      imageUrl: data.imageUrl != null ? String(data.imageUrl) : undefined,
      isActive: data.isActive !== false,
      ...(data.ownerUserId != null ? { ownerUserId: String(data.ownerUserId) } : {}),
      ...(data.approvalStatus != null
        ? { approvalStatus: data.approvalStatus as RentalVehicleApprovalStatus }
        : {}),
    };
  }
}
