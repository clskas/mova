import { HttpStatus, Injectable } from '@nestjs/common';
import { CarpoolStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CreateCarpoolTripDto } from './carpool.dto';

const MATCH_RADIUS_KM = 5;

@Injectable()
export class CarpoolService {
  constructor(private prisma: PrismaService, private pricing: PricingService) {}

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
    return { trip: updated, passenger };
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
}
