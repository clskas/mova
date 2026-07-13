import { HttpStatus, Injectable } from '@nestjs/common';
import { CarpoolStatus, CommissionServiceType, VehicleType } from '@prisma/client';
import {
  canCancelCarpoolTrip,
  INTERNAL_API_KEY,
  MovaErrorCode,
  MovaHttpException,
  UserRole,
  estimateTripDurationMin,
  findServiceAreaByName,
  serviceUrl,
} from '@mova/shared';
import { addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import { fetchServicePaymentStatus } from '../common/payment-status.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CommissionService } from '../rides/commission.service';
import { RoutingService } from '../geo/routing.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { CreateCarpoolTripDto } from './carpool.dto';

type TripRow = {
  id: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  seatsAvailable: number;
  pricePerSeatCdf: number;
  seatsTotal: number;
  driverId: string;
  status: CarpoolStatus;
  departureAt: Date;
  fromCity?: string | null;
  toCity?: string | null;
  meetingPoint?: string | null;
  notes?: string | null;
  ladiesOnly?: boolean;
  instantBooking?: boolean;
  vehicleInfo?: string | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  passengers?: { id: string; userId: string; seats: number }[];
};

@Injectable()
export class CarpoolService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private routing: RoutingService,
    private commission: CommissionService,
    private platformConfig: PlatformConfigService,
  ) {}

  private carpoolCfg() {
    return this.platformConfig.get().carpool;
  }

  private tripSpeedCarpool() {
    return this.platformConfig.get().trip.averageSpeedKmh.carpool;
  }

  private maskPhone(phone?: string): string {
    if (!phone || phone.length < 6) return '+243 *** ***';
    return `${phone.slice(0, 4)} *** ${phone.slice(-3)}`;
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

  private async fetchDriverProfile(userId: string) {
    try {
      const res = await fetch(serviceUrl('driver', `/internal/drivers/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        kycStatus?: string;
        ratingAvg?: number;
        vehicles?: Array<{
          type?: string;
          make?: string | null;
          model?: string | null;
          plateNumber?: string;
          imageUrl?: string | null;
          isActive?: boolean;
        }>;
        vehicleMake?: string;
        vehicleModel?: string;
        vehiclePlate?: string;
        user?: { firstName?: string; lastName?: string; phone?: string };
      };
    } catch {
      return null;
    }
  }

  /** Publication réservée aux chauffeurs MOVA avec KYC approuvé. */
  async assertCanPublishCarpool(userId: string, role?: string): Promise<void> {
    if (role !== UserRole.DRIVER) {
      throw new MovaHttpException(MovaErrorCode.CARPOOL_PUBLISH_DRIVER_ONLY);
    }
    const profile = await this.fetchDriverProfile(userId);
    if (!profile || profile.kycStatus !== 'APPROVED') {
      throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    }
  }

  private async driverRatingAvg(driverId: string): Promise<number> {
    const agg = await this.prisma.carpoolRating.aggregate({
      where: { toUserId: driverId },
      _avg: { score: true },
    });
    if (agg._avg.score != null) return Math.round(agg._avg.score * 10) / 10;
    const profile = await this.fetchDriverProfile(driverId);
    return profile?.ratingAvg ?? 4.5;
  }

  private resolveCity(address: string): string {
    const area = findServiceAreaByName(address);
    return area?.name ?? address.split(',')[0]?.trim() ?? 'Kinshasa';
  }

  private timelineStep(status: CarpoolStatus, passengerCount: number): string {
    if (status === CarpoolStatus.CANCELLED) return 'Annulé';
    if (status === CarpoolStatus.COMPLETED) return 'Terminé';
    if (status === CarpoolStatus.IN_PROGRESS) return 'En route';
    if (passengerCount > 0 || status === CarpoolStatus.MATCHED) return 'Places réservées';
    return 'Publié';
  }

  private pickDriverVehicle(profile: {
    vehicles?: Array<{
      type?: string;
      make?: string | null;
      model?: string | null;
      plateNumber?: string;
      imageUrl?: string | null;
      isActive?: boolean;
    }>;
    vehicleMake?: string;
    vehicleModel?: string;
    vehiclePlate?: string;
  } | null) {
    if (!profile) return null;
    const vehicle = profile.vehicles?.find((v) => v.isActive !== false) ?? profile.vehicles?.[0];
    if (vehicle) {
      return {
        type: vehicle.type,
        make: vehicle.make,
        model: vehicle.model,
        plateNumber: vehicle.plateNumber,
        imageUrl: vehicle.imageUrl,
        label: [vehicle.make, vehicle.model, vehicle.plateNumber].filter(Boolean).join(' · '),
      };
    }
    if (profile.vehicleMake || profile.vehicleModel || profile.vehiclePlate) {
      return {
        label: [profile.vehicleMake, profile.vehicleModel, profile.vehiclePlate].filter(Boolean).join(' · '),
      };
    }
    return null;
  }

  private async enrichCarpoolPricing(
    t: TripRow & { passengers?: { seats?: number }[] },
    formatted: Record<string, unknown>,
    viewerUserId?: string,
  ) {
    const bookedSeats = (t.passengers ?? []).reduce((sum, p) => sum + (p.seats ?? 1), 0);
    const pricePerSeat = (t.pricePerSeatCdf ?? 0) as number;
    const bookedRevenue = pricePerSeat * bookedSeats;
    const enriched: Record<string, unknown> = {
      ...formatted,
      type: 'CARPOOL',
      bookedSeats,
      passengerTotalCdf: bookedRevenue > 0 ? bookedRevenue : formatted.totalPriceCdf,
    };
    if (viewerUserId && t.driverId === viewerUserId && bookedRevenue > 0) {
      const rule = await this.commission.get(CommissionServiceType.CARPOOL);
      enriched.driverGrossCdf = bookedRevenue;
      enriched.driverNetCdf = Math.round(
        this.commission.splitGross(bookedRevenue, rule.platformPercent).driverNetCdf,
      );
    }
    return enriched;
  }

  private async formatTripForMobile(
    t: TripRow,
    driverMeta?: { name?: string; phone?: string; rating?: number; kycVerified?: boolean },
    viewerUserId?: string,
  ) {
    const passengers = t.passengers ?? [];
    const passengerRows = await Promise.all(
      passengers.map(async (p) => {
        const user = await this.fetchUserBrief(p.userId);
        return {
          id: p.id,
          userId: p.userId,
          seats: p.seats,
          label: user?.name ?? `Passager ${p.userId.slice(0, 6)}`,
        };
      }),
    );
    const distanceKm =
      t.distanceKm ??
      (await this.routing.roadDistanceKm(t.pickupLat, t.pickupLng, t.dropoffLat, t.dropoffLng));
    const durationMin = t.durationMin ?? estimateTripDurationMin(distanceKm, this.tripSpeedCarpool());
    const rating = driverMeta?.rating ?? (await this.driverRatingAvg(t.driverId));
    const profile = driverMeta?.kycVerified != null ? null : await this.fetchDriverProfile(t.driverId);
    const kycVerified = driverMeta?.kycVerified ?? profile?.kycStatus === 'APPROVED';
    const driverName = driverMeta?.name ?? `Conducteur ${(t.driverId ?? 'unknown').slice(0, 6)}`;
    const driverPhoneRaw = driverMeta?.phone ?? profile?.user?.phone;
    const myPassenger = viewerUserId ? passengers.find((p) => p.userId === viewerUserId) : undefined;
    const contactPhone =
      myPassenger && driverPhoneRaw
        ? driverPhoneRaw
        : this.maskPhone(driverPhoneRaw);
    const driverVehicle = this.pickDriverVehicle(profile);

    const base = {
      id: t.id,
      status: t.status,
      type: 'CARPOOL',
      fromAddress: t.pickupAddress ?? t.fromCity ?? 'Kinshasa',
      toAddress: t.dropoffAddress ?? t.toCity ?? 'Kinshasa',
      fromCity: t.fromCity ?? this.resolveCity(t.pickupAddress ?? ''),
      toCity: t.toCity ?? this.resolveCity(t.dropoffAddress ?? ''),
      pickupLat: t.pickupLat,
      pickupLng: t.pickupLng,
      dropoffLat: t.dropoffLat,
      dropoffLng: t.dropoffLng,
      driverId: t.driverId,
      driverName,
      driverRating: rating,
      kycVerified,
      availableSeats: t.seatsAvailable ?? 0,
      seatsTotal: t.seatsTotal ?? t.seatsAvailable ?? 1,
      totalPriceCdf: (t.pricePerSeatCdf ?? 0) * (t.seatsTotal ?? t.seatsAvailable ?? 1),
      pricePerSeatCdf: t.pricePerSeatCdf ?? 0,
      departureAt: t.departureAt?.toISOString(),
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMin,
      etaLabel: `~${durationMin} min · ${Math.round(distanceKm * 10) / 10} km`,
      meetingPoint: t.meetingPoint,
      notes: t.notes,
      ladiesOnly: t.ladiesOnly ?? false,
      instantBooking: t.instantBooking ?? true,
      vehicleInfo: t.vehicleInfo ?? driverVehicle?.label ?? null,
      vehicleImageUrl: driverVehicle?.imageUrl ?? null,
      vehicleType: driverVehicle?.type ?? null,
      vehiclePlate: driverVehicle?.plateNumber ?? null,
      passengerCount: passengers.length,
      passengers: passengerRows,
      timelineStep: this.timelineStep(t.status, passengers.length),
      contactPhone,
      contactAction: 'Contacter le conducteur',
      ...canCancelCarpoolTrip({ status: t.status, departureAt: t.departureAt }),
    };
    const priced = await this.enrichCarpoolPricing(t, base, viewerUserId);
    if (!viewerUserId) return priced;

    const enriched: Record<string, unknown> = { ...priced };
    if (myPassenger) {
      enriched.isViewerPassenger = true;
      enriched.mySeats = myPassenger.seats;
      enriched.myBookingId = myPassenger.id;
      enriched.paymentReferenceId = myPassenger.id;
      enriched.myTotalCdf = (t.pricePerSeatCdf ?? 0) * myPassenger.seats;
      enriched.passengerTotalCdf = enriched.myTotalCdf;
      if (t.status === CarpoolStatus.COMPLETED) {
        const payment = await fetchServicePaymentStatus('CARPOOL', myPassenger.id);
        enriched.isPaid = payment.isPaid;
        enriched.paymentReady = true;
        const existingRating = await this.prisma.carpoolRating.findUnique({
          where: { tripId_fromUserId: { tripId: t.id, fromUserId: viewerUserId } },
        });
        enriched.hasRated = !!existingRating;
      } else {
        enriched.isPaid = false;
        enriched.paymentReady = false;
        enriched.hasRated = false;
      }
    }
    if (t.driverId === viewerUserId) {
      enriched.isViewerDriver = true;
    }
    return enriched;
  }

  async estimateMobile(fromAddress: string, toAddress: string, seats: number) {
    const pickup = addressToCoords(fromAddress);
    const dropoff = addressToCoords(toAddress);
    const route = await this.routing.resolveRoadDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const distanceKm = route.distanceKm;
    const durationMin = route.durationMin ?? estimateTripDurationMin(distanceKm, this.tripSpeedCarpool());
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin);
    const totalPriceCdf = Math.max(fare.estimatedFareCdf, 5000 * seats);
    return {
      totalPriceCdf,
      pricePerSeatCdf: Math.ceil(totalPriceCdf / Math.max(seats, 1)),
      currency: 'CDF',
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMin,
      fromCity: this.resolveCity(fromAddress),
      toCity: this.resolveCity(toAddress),
    };
  }

  async createFromMobile(
    driverId: string,
    fromAddress: string,
    toAddress: string,
    seats: number,
    departureAt?: string,
    opts?: {
      pricePerSeatCdf?: number;
      meetingPoint?: string;
      notes?: string;
      ladiesOnly?: boolean;
      instantBooking?: boolean;
      vehicleInfo?: string;
      actorRole?: string;
      fromLat?: number;
      fromLng?: number;
      toLat?: number;
      toLng?: number;
    },
  ) {
    const pickup =
      opts?.fromLat != null && opts?.fromLng != null
        ? { lat: opts.fromLat, lng: opts.fromLng }
        : addressToCoords(fromAddress);
    const dropoff =
      opts?.toLat != null && opts?.toLng != null
        ? { lat: opts.toLat, lng: opts.toLng }
        : addressToCoords(toAddress);
    const estimate = await this.estimateMobile(fromAddress, toAddress, seats);
    const when = departureAt ? new Date(departureAt) : new Date(Date.now() + 3600000);
    const dto: CreateCarpoolTripDto = {
      departureAt: when.toISOString(),
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupAddress: fromAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      dropoffAddress: toAddress,
      fromCity: estimate.fromCity,
      toCity: estimate.toCity,
      seatsTotal: seats,
      pricePerSeatCdf: opts?.pricePerSeatCdf ?? estimate.pricePerSeatCdf,
      meetingPoint: opts?.meetingPoint,
      notes: opts?.notes,
      ladiesOnly: opts?.ladiesOnly,
      instantBooking: opts?.instantBooking,
      vehicleInfo: opts?.vehicleInfo,
    };
    const { trip } = await this.create(driverId, dto, opts?.actorRole);
    const user = await this.fetchUserBrief(driverId);
    return {
      trip: await this.formatTripForMobile({ ...trip, passengers: [] }, { name: user?.name ?? 'Vous', phone: user?.phone }),
      ride: {
        id: trip.id,
        status: trip.status,
        type: 'CARPOOL',
        fromAddress,
        toAddress,
        seats,
        driverName: user?.name ?? 'Vous',
        totalPriceCdf: estimate.totalPriceCdf,
        departureAt: trip.departureAt.toISOString(),
      },
    };
  }

  async listMobileRides() {
    const { trips } = await this.list();
    const data = await Promise.all(trips.map((t) => this.formatTripForMobile(t)));
    return { data };
  }

  async searchMobile(
    fromAddress: string,
    toAddress: string,
    date?: string,
    sort?: 'price' | 'departure' | 'rating',
    coords?: { fromLat?: number; fromLng?: number; toLat?: number; toLng?: number },
  ) {
    const result = await this.search({
      from: fromAddress,
      to: toAddress,
      date,
      sort,
      fromLat: coords?.fromLat,
      fromLng: coords?.fromLng,
      toLat: coords?.toLat,
      toLng: coords?.toLng,
    });
    return { data: result.data };
  }

  async search(query: {
    from?: string;
    to?: string;
    date?: string;
    sort?: 'price' | 'departure' | 'rating';
    fromLat?: number;
    fromLng?: number;
    toLat?: number;
    toLng?: number;
  }) {
    const fromCity = query.from?.trim();
    const toCity = query.to?.trim();
    let dateStart: Date | undefined;
    let dateEnd: Date | undefined;
    if (query.date) {
      const d = new Date(query.date);
      dateStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      dateEnd = new Date(dateStart);
      dateEnd.setDate(dateEnd.getDate() + 1);
    }

    const trips = await this.prisma.carpoolTrip.findMany({
      where: {
        status: CarpoolStatus.OPEN,
        seatsAvailable: { gt: 0 },
        departureAt: dateStart && dateEnd
          ? { gte: dateStart, lt: dateEnd, gt: new Date() }
          : { gt: new Date() },
      },
      orderBy: query.sort === 'price' ? { pricePerSeatCdf: 'asc' } : { departureAt: 'asc' },
      take: 100,
      include: { passengers: { select: { id: true, userId: true, seats: true } } },
    });

    let filtered = trips;
    if (fromCity) {
      const lower = fromCity.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.fromCity?.toLowerCase().includes(lower) ||
          t.pickupAddress?.toLowerCase().includes(lower),
      );
    }
    if (toCity) {
      const lower = toCity.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.toCity?.toLowerCase().includes(lower) ||
          t.dropoffAddress?.toLowerCase().includes(lower),
      );
    }

    if (query.from && query.to) {
      const pickup =
        query.fromLat != null && query.fromLng != null
          ? { lat: query.fromLat, lng: query.fromLng }
          : addressToCoords(query.from);
      const dropoff =
        query.toLat != null && query.toLng != null
          ? { lat: query.toLat, lng: query.toLng }
          : addressToCoords(query.to);
      filtered = filtered.filter((t) => {
        const pickupDist = this.pricing.haversineKm(pickup.lat, pickup.lng, t.pickupLat, t.pickupLng);
        const dropoffDist = this.pricing.haversineKm(dropoff.lat, dropoff.lng, t.dropoffLat, t.dropoffLng);
        const { matchRadiusKm, relaxedRadiusMultiplier } = this.carpoolCfg();
        return pickupDist <= matchRadiusKm * relaxedRadiusMultiplier && dropoffDist <= matchRadiusKm * relaxedRadiusMultiplier;
      });
    }

    let formatted = await Promise.all(filtered.slice(0, 50).map((t) => this.formatTripForMobile(t)));

    if (query.sort === 'rating') {
      formatted.sort((a, b) => (b.driverRating as number) - (a.driverRating as number));
    }

    return { data: formatted, count: formatted.length };
  }

  async create(driverId: string, dto: CreateCarpoolTripDto, actorRole?: string) {
    await this.assertCanPublishCarpool(driverId, actorRole);
    const departureAt = new Date(dto.departureAt);
    if (departureAt <= new Date()) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_PAST);
    const route = await this.routing.resolveRoadDistance(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const distanceKm = route.distanceKm;
    const durationMin = route.durationMin ?? estimateTripDurationMin(distanceKm, this.tripSpeedCarpool());
    let vehicleInfo = dto.vehicleInfo;
    if (!vehicleInfo) {
      const profile = await this.fetchDriverProfile(driverId);
      if (profile?.vehicleMake || profile?.vehicleModel) {
        vehicleInfo = [profile.vehicleMake, profile.vehicleModel, profile.vehiclePlate].filter(Boolean).join(' · ');
      }
    }
    const trip = await this.prisma.carpoolTrip.create({
      data: {
        driverId,
        status: CarpoolStatus.OPEN,
        departureAt,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress,
        fromCity: dto.fromCity ?? (dto.pickupAddress ? this.resolveCity(dto.pickupAddress) : undefined),
        toCity: dto.toCity ?? (dto.dropoffAddress ? this.resolveCity(dto.dropoffAddress) : undefined),
        meetingPoint: dto.meetingPoint,
        seatsTotal: dto.seatsTotal,
        seatsAvailable: dto.seatsTotal,
        pricePerSeatCdf: dto.pricePerSeatCdf,
        notes: dto.notes,
        ladiesOnly: dto.ladiesOnly ?? false,
        instantBooking: dto.instantBooking ?? true,
        vehicleInfo,
        distanceKm,
        durationMin,
      },
      include: { passengers: true },
    });
    return { trip, distanceKm };
  }

  async list(query?: { pickupLat?: number; pickupLng?: number; dropoffLat?: number; dropoffLng?: number }) {
    const trips = await this.prisma.carpoolTrip.findMany({
      where: { status: CarpoolStatus.OPEN, seatsAvailable: { gt: 0 }, departureAt: { gt: new Date() } },
      orderBy: { departureAt: 'asc' },
      take: 50,
      include: { passengers: { select: { id: true, userId: true, seats: true } } },
    });
    if (!query?.pickupLat || !query?.pickupLng) return { trips, matches: trips };
    const matches = trips.filter((t) => {
      const pickupDist = this.pricing.haversineKm(query.pickupLat!, query.pickupLng!, t.pickupLat, t.pickupLng);
      const dropoffDist = query.dropoffLat && query.dropoffLng
        ? this.pricing.haversineKm(query.dropoffLat, query.dropoffLng, t.dropoffLat, t.dropoffLng)
        : 0;
      const { matchRadiusKm } = this.carpoolCfg();
      return pickupDist <= matchRadiusKm && (!query.dropoffLat || dropoffDist <= matchRadiusKm);
    });
    return { trips, matches };
  }

  async book(tripId: string, userId: string, seats: number) {
    return this.join(tripId, userId, seats);
  }

  async join(tripId: string, userId: string, seats: number) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId }, include: { passengers: true } });
    if (!trip || trip.status === CarpoolStatus.CANCELLED || trip.status === CarpoolStatus.COMPLETED) {
      throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (trip.status !== CarpoolStatus.OPEN && trip.status !== CarpoolStatus.MATCHED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Ce trajet n\'accepte plus de réservations.');
    }
    if (trip.driverId === userId) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    if (trip.passengers.some((p) => p.userId === userId)) throw new MovaHttpException(MovaErrorCode.CARPOOL_ALREADY_JOINED);
    if (trip.seatsAvailable < seats) throw new MovaHttpException(MovaErrorCode.CARPOOL_NO_SEATS);
    const passenger = await this.prisma.carpoolPassenger.create({ data: { tripId, userId, seats } });
    const seatsAvailable = trip.seatsAvailable - seats;
    const status = seatsAvailable === 0 ? CarpoolStatus.MATCHED : CarpoolStatus.OPEN;
    const updated = await this.prisma.carpoolTrip.update({
      where: { id: tripId },
      data: { seatsAvailable, status },
      include: { passengers: true },
    });
    const driverUser = await this.fetchUserBrief(trip.driverId);
    const driverProfile = await this.fetchDriverProfile(trip.driverId);
    const formatted = await this.formatTripForMobile(
      updated,
      {
        name: driverUser?.name,
        phone: driverUser?.phone,
        rating: driverProfile?.ratingAvg,
        kycVerified: driverProfile?.kycStatus === 'APPROVED',
      },
      userId,
    );
    return {
      trip: formatted,
      passenger,
      success: true,
      confirmation: {
        tripId,
        seats,
        totalCdf: trip.pricePerSeatCdf * seats,
        driverName: formatted.driverName,
        contactPhone: formatted.contactPhone,
        departureAt: trip.departureAt.toISOString(),
      },
    };
  }

  async myTrips(userId: string) {
    const asDriver = await this.prisma.carpoolTrip.findMany({
      where: { driverId: userId },
      orderBy: { departureAt: 'desc' },
      take: 20,
      include: { passengers: true },
    });
    const asPassenger = await this.prisma.carpoolPassenger.findMany({
      where: { userId },
      include: { trip: { include: { passengers: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const driverTrips = await Promise.all(asDriver.map((t) => this.formatTripForMobile(t, undefined, userId)));
    const passengerTrips = await Promise.all(
      asPassenger.map(async (p) => ({
        bookingId: p.id,
        seats: p.seats,
        trip: await this.formatTripForMobile(p.trip, undefined, userId),
      })),
    );
    return { asDriver: driverTrips, asPassenger: passengerTrips };
  }

  async get(id: string, viewerUserId?: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({
      where: { id },
      include: { passengers: { select: { id: true, userId: true, seats: true, createdAt: true } } },
    });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    const driverUser = await this.fetchUserBrief(trip.driverId);
    const driverProfile = await this.fetchDriverProfile(trip.driverId);
    return {
      trip: await this.formatTripForMobile(
        trip,
        {
          name: driverUser?.name,
          phone: driverUser?.phone,
          rating: driverProfile?.ratingAvg,
          kycVerified: driverProfile?.kycStatus === 'APPROVED',
        },
        viewerUserId,
      ),
    };
  }

  async cancelTripOrBooking(tripId: string, userId: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId }, include: { passengers: true } });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (trip.driverId === userId) return this.cancel(tripId, userId);
    const passenger = trip.passengers.find((p) => p.userId === userId);
    if (passenger) return this.leave(tripId, userId);
    throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
  }

  async cancel(tripId: string, userId: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (trip.driverId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (trip.status === CarpoolStatus.COMPLETED || trip.status === CarpoolStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    }
    if (trip.departureAt <= new Date()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Impossible d\'annuler après le départ.');
    }
    return this.prisma.carpoolTrip.update({
      where: { id: tripId },
      data: { status: CarpoolStatus.CANCELLED, seatsAvailable: 0 },
    });
  }

  async leave(tripId: string, userId: string) {
    const passenger = await this.prisma.carpoolPassenger.findFirst({ where: { tripId, userId } });
    if (!passenger) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId } });
    if (!trip || trip.status === CarpoolStatus.CANCELLED || trip.status === CarpoolStatus.COMPLETED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    }
    if (trip.departureAt <= new Date()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Impossible d\'annuler après le départ.');
    }
    await this.prisma.carpoolPassenger.delete({ where: { id: passenger.id } });
    const updated = await this.prisma.carpoolTrip.update({
      where: { id: tripId },
      data: {
        seatsAvailable: trip.seatsAvailable + passenger.seats,
        status: CarpoolStatus.OPEN,
      },
      include: { passengers: true },
    });
    return { trip: await this.formatTripForMobile(updated, undefined, userId), cancelled: true };
  }

  async rateTrip(tripId: string, fromUserId: string, score: number, comment?: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId }, include: { passengers: true } });
    if (!trip || trip.status !== CarpoolStatus.COMPLETED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Évaluation disponible après trajet terminé.');
    }
    const isPassenger = trip.passengers.some((p) => p.userId === fromUserId);
    if (!isPassenger) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    const rating = await this.prisma.carpoolRating.upsert({
      where: { tripId_fromUserId: { tripId, fromUserId } },
      create: { tripId, fromUserId, toUserId: trip.driverId, score, comment },
      update: { score, comment },
    });
    return { rating, driverRating: await this.driverRatingAvg(trip.driverId) };
  }

  async startTrip(tripId: string, userId: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({
      where: { id: tripId },
      include: { passengers: true },
    });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (trip.driverId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (trip.status !== CarpoolStatus.MATCHED && trip.status !== CarpoolStatus.OPEN) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le trajet ne peut pas démarrer dans cet état.');
    }
    if (trip.passengers.length < 1) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Au moins un passager est requis pour démarrer le trajet.',
      );
    }
    const updated = await this.prisma.carpoolTrip.update({
      where: { id: tripId },
      data: { status: CarpoolStatus.IN_PROGRESS },
      include: { passengers: true },
    });
    const driverUser = await this.fetchUserBrief(userId);
    return {
      trip: await this.formatTripForMobile(
        updated,
        { name: driverUser?.name, phone: driverUser?.phone },
        userId,
      ),
    };
  }

  async completeTrip(tripId: string, userId: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (trip.driverId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (trip.status !== CarpoolStatus.IN_PROGRESS) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le trajet doit être en cours pour être terminé.');
    }
    const updated = await this.prisma.carpoolTrip.update({
      where: { id: tripId },
      data: { status: CarpoolStatus.COMPLETED },
      include: { passengers: true },
    });
    const driverUser = await this.fetchUserBrief(userId);
    const formatted = await this.formatTripForMobile(
      updated,
      { name: driverUser?.name, phone: driverUser?.phone },
      userId,
    );
    return { trip: formatted, paymentReady: true };
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.carpoolTrip.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { passengers: { select: { id: true, userId: true, seats: true } } },
    });
    return Promise.all(
      rows.map(async (t) => {
        const profile = await this.fetchDriverProfile(t.driverId);
        const driverVehicle = this.pickDriverVehicle(profile);
        const driverName = profile?.user
          ? [profile.user.firstName, profile.user.lastName].filter(Boolean).join(' ').trim()
          : undefined;
        return {
          id: t.id,
          driverId: t.driverId,
          driverName,
          fromAddress: t.pickupAddress,
          toAddress: t.dropoffAddress,
          fromCity: t.fromCity,
          toCity: t.toCity,
          status: t.status,
          seatsAvailable: t.seatsAvailable,
          passengerCount: t.passengers.length,
          pricePerSeatCdf: t.pricePerSeatCdf,
          departureAt: t.departureAt.toISOString(),
          createdAt: t.createdAt.toISOString(),
          vehicleInfo: t.vehicleInfo ?? driverVehicle?.label ?? null,
          vehicleImageUrl: driverVehicle?.imageUrl ?? null,
          vehicleType: driverVehicle?.type ?? null,
          vehiclePlate: driverVehicle?.plateNumber ?? null,
        };
      }),
    );
  }

  async adminCancel(tripId: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (trip.status === CarpoolStatus.COMPLETED || trip.status === CarpoolStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    }
    return this.prisma.carpoolTrip.update({ where: { id: tripId }, data: { status: CarpoolStatus.CANCELLED, seatsAvailable: 0 } });
  }

  async adminUpdateStatus(tripId: string, status: CarpoolStatus) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    return this.prisma.carpoolTrip.update({ where: { id: tripId }, data: { status }, include: { passengers: true } });
  }
}

export { DEFAULT_PICKUP };
