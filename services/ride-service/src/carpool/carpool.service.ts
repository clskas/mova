import { HttpStatus, Injectable } from '@nestjs/common';
import { CarpoolStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CreateCarpoolTripDto } from './carpool.dto';

const MATCH_RADIUS_KM = 5;

@Injectable()
export class CarpoolService {
  constructor(private prisma: PrismaService, private pricing: PricingService) {}

  private formatTripForMobile(t: {
    id: string;
    pickupAddress: string | null;
    dropoffAddress: string | null;
    seatsAvailable: number;
    pricePerSeatCdf: number;
    seatsTotal: number;
    driverId: string;
    departureAt?: Date;
    passengers?: { id: string; userId: string; seats: number }[];
  }) {
    const passengers = t.passengers ?? [];
    return {
      id: t.id,
      fromAddress: t.pickupAddress ?? 'Kinshasa',
      toAddress: t.dropoffAddress ?? 'Kinshasa',
      driverName: `Chauffeur ${(t.driverId ?? 'unknown').slice(0, 6)}`,
      availableSeats: t.seatsAvailable ?? 0,
      seatsTotal: t.seatsTotal ?? t.seatsAvailable ?? 1,
      totalPriceCdf: (t.pricePerSeatCdf ?? 0) * (t.seatsTotal ?? t.seatsAvailable ?? 1),
      pricePerSeatCdf: t.pricePerSeatCdf ?? 0,
      departureAt: t.departureAt?.toISOString(),
      passengerCount: passengers.length,
      passengers: passengers.map((p) => ({
        id: p.id,
        userId: p.userId,
        seats: p.seats,
        label: `Passager ${p.userId.slice(0, 6)}`,
      })),
    };
  }

  async estimateMobile(fromAddress: string, toAddress: string, seats: number) {
    const pickup = addressToCoords(fromAddress);
    const dropoff = addressToCoords(toAddress);
    const distanceKm = this.pricing.haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const durationMin = (distanceKm / 30) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin);
    const totalPriceCdf = Math.max(fare.estimatedFareCdf, 5000 * seats);
    return {
      totalPriceCdf,
      pricePerSeatCdf: Math.ceil(totalPriceCdf / Math.max(seats, 1)),
      currency: 'CDF',
      distanceKm,
      durationMin,
    };
  }

  async createFromMobile(driverId: string, fromAddress: string, toAddress: string, seats: number, departureAt?: string) {
    const pickup = addressToCoords(fromAddress);
    const dropoff = addressToCoords(toAddress);
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
      seatsTotal: seats,
      pricePerSeatCdf: estimate.pricePerSeatCdf,
    };
    const { trip } = await this.create(driverId, dto);
    return {
      trip: this.formatTripForMobile({ ...trip, passengers: [] }),
      ride: {
        id: trip.id,
        status: trip.status,
        type: 'CARPOOL',
        fromAddress,
        toAddress,
        seats,
        driverName: 'Vous',
        totalPriceCdf: estimate.totalPriceCdf,
        departureAt: trip.departureAt.toISOString(),
      },
    };
  }

  async listMobileRides() {
    const { trips } = await this.list();
    return { data: trips.map((t) => this.formatTripForMobile(t)) };
  }

  async searchMobile(fromAddress: string, toAddress: string) {
    const pickup = addressToCoords(fromAddress);
    const dropoff = addressToCoords(toAddress);
    const { matches } = await this.list({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng });
    return { data: matches.map((t) => this.formatTripForMobile(t)) };
  }

  async create(driverId: string, dto: CreateCarpoolTripDto) {
    const departureAt = new Date(dto.departureAt);
    if (departureAt <= new Date()) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_PAST);
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
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
        seatsTotal: dto.seatsTotal,
        seatsAvailable: dto.seatsTotal,
        pricePerSeatCdf: dto.pricePerSeatCdf,
        notes: dto.notes,
      },
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
      return pickupDist <= MATCH_RADIUS_KM && (!query.dropoffLat || dropoffDist <= MATCH_RADIUS_KM);
    });
    return { trips, matches };
  }

  async join(tripId: string, userId: string, seats: number) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId }, include: { passengers: true } });
    if (!trip || trip.status !== CarpoolStatus.OPEN) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
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
    return {
      trip: this.formatTripForMobile(updated),
      passenger,
      success: true,
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
    return { asDriver, asPassenger };
  }

  async get(id: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({
      where: { id },
      include: { passengers: { select: { id: true, userId: true, seats: true, createdAt: true } } },
    });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    return { trip: this.formatTripForMobile(trip), raw: trip };
  }

  async cancel(tripId: string, userId: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (trip.driverId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (trip.status === CarpoolStatus.COMPLETED || trip.status === CarpoolStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
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
    await this.prisma.carpoolPassenger.delete({ where: { id: passenger.id } });
    return this.prisma.carpoolTrip.update({
      where: { id: tripId },
      data: {
        seatsAvailable: trip.seatsAvailable + passenger.seats,
        status: CarpoolStatus.OPEN,
      },
      include: { passengers: true },
    });
  }

  async startTrip(tripId: string, userId: string) {
    const trip = await this.prisma.carpoolTrip.findUnique({ where: { id: tripId } });
    if (!trip) throw new MovaHttpException(MovaErrorCode.CARPOOL_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (trip.driverId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (trip.status !== CarpoolStatus.MATCHED && trip.status !== CarpoolStatus.OPEN) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Le trajet ne peut pas démarrer dans cet état.');
    }
    return this.prisma.carpoolTrip.update({
      where: { id: tripId },
      data: { status: CarpoolStatus.IN_PROGRESS },
      include: { passengers: true },
    });
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
    return { trip: updated, paymentReady: true };
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.carpoolTrip.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { passengers: { select: { id: true, userId: true, seats: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      driverId: t.driverId,
      fromAddress: t.pickupAddress,
      toAddress: t.dropoffAddress,
      status: t.status,
      seatsAvailable: t.seatsAvailable,
      passengerCount: t.passengers.length,
      pricePerSeatCdf: t.pricePerSeatCdf,
      departureAt: t.departureAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    }));
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
