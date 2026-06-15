import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RentalInquiryStatus } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRentalBookingDto,
  CreateRentalInquiryDto,
  RentalQuoteDto,
  RentalVehicleQueryDto,
} from './rental.dto';

type RentalAddOns = { childSeat?: boolean; gps?: boolean; extraDriver?: boolean };

const CATEGORY_ALIASES: Record<string, string> = {
  economique: 'ECONOMY',
  économique: 'ECONOMY',
  economy: 'ECONOMY',
  berline: 'ECONOMY',
  moto: 'ECONOMY',
  suv: 'SUV',
  premium: 'PREMIUM',
  vip: 'PREMIUM',
  confort: 'PREMIUM',
};

const TIMELINE_STEPS = [
  { status: RentalInquiryStatus.PENDING, label: 'Demande' },
  { status: RentalInquiryStatus.CONFIRMED, label: 'Confirmée' },
  { status: RentalInquiryStatus.IN_PROGRESS, label: 'En cours' },
  { status: RentalInquiryStatus.RETURNED, label: 'Retournée' },
] as const;

@Injectable()
export class RentalService {
  constructor(private prisma: PrismaService) {}

  private normalizeCategory(raw?: string): string | undefined {
    if (!raw) return undefined;
    const key = raw.trim().toLowerCase();
    return CATEGORY_ALIASES[key] ?? raw.trim().toUpperCase();
  }

  private validateDates(startDate: Date, endDate: Date) {
    if (endDate <= startDate) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
  }

  private rentalDays(startDate: Date, endDate: Date): number {
    return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)));
  }

  private mapVehicle(row: {
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
  }) {
    const features = Array.isArray(row.features) ? row.features : [];
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
    return {
      data: rows.map((r) => this.mapVehicle(r)),
      currency: MARKET_RDC.currency,
      filters: {
        categories: ['ECONOMY', 'SUV', 'PREMIUM'],
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
    return {
      vehicle: this.mapVehicle(vehicle),
      options: {
        insuranceTiers: MARKET_RDC.rental.insuranceTiers,
        addOns: MARKET_RDC.rental.addOns,
        rentalPeriods: [
          { id: 'DAILY', label: 'À la journée' },
          { id: 'WEEKLY', label: 'À la semaine', discountPct: MARKET_RDC.rental.weeklyDiscountPct },
        ],
        mileageTypes: [
          { id: 'UNLIMITED', label: 'Kilométrage illimité' },
          {
            id: 'LIMITED',
            label: `Limité (${MARKET_RDC.rental.limitedMileageKmPerDay} km/j)`,
            feeCdf: MARKET_RDC.rental.limitedMileageFeeCdf,
          },
        ],
      },
      currency: MARKET_RDC.currency,
    };
  }

  computeQuote(
    vehicle: {
      dailyRateCdf: number;
      depositCdf: number;
      weeklyDiscountPct: number;
      limitedMileageFeeCdf: number;
      category: string;
      name: string;
      seats: number;
    },
    dto: RentalQuoteDto,
    startDate: Date,
    endDate: Date,
  ) {
    const days = this.rentalDays(startDate, endDate);
    const rentalPeriod = dto.rentalPeriod ?? 'DAILY';
    const mileageType = dto.mileageType ?? 'UNLIMITED';
    const insuranceTier = (dto.insuranceTier ?? 'BASIC') as keyof typeof MARKET_RDC.rental.insuranceTiers;
    const addOns = (dto.addOns ?? {}) as RentalAddOns;
    const pickupCity = dto.pickupCity?.trim();
    const returnCity = dto.returnCity?.trim() ?? pickupCity;

    let rentalFeeCdf = vehicle.dailyRateCdf * days;
    let weeklyDiscountCdf = 0;
    if (rentalPeriod === 'WEEKLY' && days >= 7) {
      const discountPct = vehicle.weeklyDiscountPct ?? MARKET_RDC.rental.weeklyDiscountPct;
      weeklyDiscountCdf = Math.round(rentalFeeCdf * (discountPct / 100));
      rentalFeeCdf -= weeklyDiscountCdf;
    }

    const tier = MARKET_RDC.rental.insuranceTiers[insuranceTier] ?? MARKET_RDC.rental.insuranceTiers.BASIC;
    const insuranceFeeCdf = Math.round(rentalFeeCdf * (tier.surchargePct / 100));

    let addOnsFeeCdf = 0;
    const addOnDetails: { id: string; label: string; priceCdf: number }[] = [];
    for (const [key, selected] of Object.entries(addOns)) {
      if (!selected) continue;
      const cfg = MARKET_RDC.rental.addOns[key as keyof typeof MARKET_RDC.rental.addOns];
      if (!cfg) continue;
      addOnsFeeCdf += cfg.priceCdf;
      addOnDetails.push({ id: key, label: cfg.label, priceCdf: cfg.priceCdf });
    }

    let interCityFeeCdf = 0;
    if (pickupCity && returnCity && pickupCity.toLowerCase() !== returnCity.toLowerCase()) {
      interCityFeeCdf = MARKET_RDC.interCity.baseSurchargeCdf;
    }

    let mileageFeeCdf = 0;
    if (mileageType === 'LIMITED') {
      mileageFeeCdf = vehicle.limitedMileageFeeCdf ?? MARKET_RDC.rental.limitedMileageFeeCdf;
    }

    const depositCdf = vehicle.depositCdf;
    const subtotalCdf = rentalFeeCdf + insuranceFeeCdf + addOnsFeeCdf + interCityFeeCdf + mileageFeeCdf;
    const totalCdf = subtotalCdf + depositCdf;

    return {
      vehicle: { id: dto.vehicleId, name: vehicle.name, category: vehicle.category, seats: vehicle.seats },
      days,
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

  async quote(dto: RentalQuoteDto) {
    const vehicle = await this.prisma.rentalVehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || !vehicle.isActive) {
      throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDates(startDate, endDate);
    return this.computeQuote(vehicle, dto, startDate, endDate);
  }

  /** @deprecated Alias quote */
  async estimate(dto: RentalQuoteDto) {
    return this.quote(dto);
  }

  async createBooking(userId: string, dto: CreateRentalBookingDto) {
    const quoteResult = await this.quote(dto);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const vehicle = await this.prisma.rentalVehicle.findUnique({ where: { id: dto.vehicleId } });
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
      },
      include: { vehicle: true },
    });
    return {
      inquiry: this.enrichInquiry(inquiry),
      quote: quoteResult,
      message: 'Demande enregistrée. Vous serez contacté après validation.',
    };
  }

  async create(userId: string, dto: CreateRentalInquiryDto) {
    if (dto.vehicleId) return this.createBooking(userId, { ...dto, vehicleId: dto.vehicleId });
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDates(startDate, endDate);
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
    return {
      inquiry: this.enrichInquiry(inquiry),
      message: 'Demande enregistrée. Un conseiller MOVA vous contactera sous 24h.',
    };
  }

  private enrichInquiry(inquiry: {
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
    createdAt: Date;
    updatedAt: Date;
    vehicle?: {
      name: string;
      ownerName: string | null;
      ownerContactPhone: string | null;
      ownerBadge: string | null;
    } | null;
  }) {
    const ownerContact =
      inquiry.status === RentalInquiryStatus.CONFIRMED ||
      inquiry.status === RentalInquiryStatus.CONTACTED ||
      inquiry.status === RentalInquiryStatus.IN_PROGRESS ||
      inquiry.status === RentalInquiryStatus.RETURNED
        ? inquiry.vehicle?.ownerContactPhone ?? MARKET_RDC.support.phone
        : null;
    return {
      ...inquiry,
      priceCdf: inquiry.totalCdf ?? inquiry.estimatedPriceCdf,
      ownerContactPhone: ownerContact,
      ownerName: inquiry.vehicle?.ownerName,
      ownerBadge: inquiry.vehicle?.ownerBadge,
      timeline: this.buildTimeline(inquiry.status),
    };
  }

  private buildTimeline(current: RentalInquiryStatus) {
    const order = TIMELINE_STEPS.map((s) => s.status);
    const currentIdx =
      current === RentalInquiryStatus.CLOSED
        ? -1
        : current === RentalInquiryStatus.CONTACTED
          ? order.indexOf(RentalInquiryStatus.CONFIRMED)
          : order.indexOf(current);
    return TIMELINE_STEPS.map((step, idx) => ({
      status: step.status,
      label: step.label,
      completed: currentIdx >= 0 && idx <= currentIdx,
      current: currentIdx >= 0 && idx === currentIdx,
    }));
  }

  async list(userId: string) {
    const rows = await this.prisma.rentalInquiry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { vehicle: true },
    });
    return { data: rows.map((r) => this.enrichInquiry(r)) };
  }

  async listBookings(userId: string) {
    const rows = await this.prisma.rentalInquiry.findMany({
      where: { userId, vehicleId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { vehicle: true },
    });
    return {
      data: rows.map((r) => ({
        ...this.enrichInquiry(r),
        paymentReady:
          r.status === RentalInquiryStatus.CONFIRMED ||
          r.status === RentalInquiryStatus.CONTACTED ||
          r.status === RentalInquiryStatus.IN_PROGRESS,
        priceCdf: r.totalCdf ?? r.estimatedPriceCdf,
        currency: MARKET_RDC.currency,
      })),
    };
  }

  async cancelBooking(id: string, userId: string) {
    const inquiry = await this.get(id, userId);
    if (inquiry.status === RentalInquiryStatus.CLOSED || inquiry.status === RentalInquiryStatus.RETURNED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Cette réservation ne peut plus être annulée.');
    }
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: { status: RentalInquiryStatus.CLOSED },
      include: { vehicle: true },
    });
    return this.enrichInquiry(updated);
  }

  async get(id: string, userId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return this.enrichInquiry(inquiry);
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.rentalInquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { vehicle: true },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      status: r.status,
      vehicleName: r.vehicle?.name ?? r.vehicleType,
      vehicleType: r.vehicleType,
      pickupCity: r.pickupCity,
      returnCity: r.returnCity,
      insuranceTier: r.insuranceTier,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      priceCdf: r.totalCdf ?? r.estimatedPriceCdf,
      estimatedPriceCdf: r.totalCdf ?? r.estimatedPriceCdf,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async adminCancel(id: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: { status: RentalInquiryStatus.CLOSED },
      include: { vehicle: true },
    });
    return this.enrichInquiry(updated);
  }

  async adminUpdateStatus(id: string, status: RentalInquiryStatus) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updated = await this.prisma.rentalInquiry.update({
      where: { id },
      data: { status },
      include: { vehicle: true },
    });
    return this.enrichInquiry(updated);
  }
}
