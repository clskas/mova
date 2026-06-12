import { HttpStatus, Injectable } from '@nestjs/common';
import { RideStatus, VehicleType } from '@prisma/client';
import { MOVA_EVENTS, MovaErrorCode, MovaHttpException, RideCreatedPayload, MARKET_RDC } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { MatchingService } from '../matching/matching.service';

@Injectable()
export class RidesService {
  constructor(private prisma: PrismaService, private pricing: PricingService, private matching: MatchingService, private redis: RedisService) {}

  async estimate(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, vehicleType: VehicleType) {
    const distanceKm = this.pricing.haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const durationMin = (distanceKm / 25) * 60;
    return this.pricing.estimateFare(vehicleType, distanceKm, durationMin);
  }

  async createRide(passengerId: string, data: { pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number; vehicleType: VehicleType; pickupAddress?: string; dropoffAddress?: string }) {
    const active = await this.prisma.ride.findFirst({ where: { passengerId, status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVED, RideStatus.IN_PROGRESS] } } });
    if (active) throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_ACTIVE);
    const estimate = await this.estimate(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng, data.vehicleType);
    const distanceKm = this.pricing.haversineKm(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng);
    const ride = await this.prisma.ride.create({
      data: { passengerId, status: RideStatus.SEARCHING, vehicleType: data.vehicleType, pickupLat: data.pickupLat, pickupLng: data.pickupLng, pickupAddress: data.pickupAddress, dropoffLat: data.dropoffLat, dropoffLng: data.dropoffLng, dropoffAddress: data.dropoffAddress, estimatedFareCdf: estimate.estimatedFareCdf, distanceKm, durationMin: (distanceKm / 25) * 60 },
    });
    await this.prisma.rideEvent.create({ data: { rideId: ride.id, event: 'CREATED' } });
    const drivers = await this.matching.findDrivers(data.pickupLat, data.pickupLng, data.vehicleType);
    const payload: RideCreatedPayload = { rideId: ride.id, passengerId, vehicleType: data.vehicleType, estimatedFareCdf: estimate.estimatedFareCdf };
    await this.redis.publish(MOVA_EVENTS.RIDE_CREATED, payload);
    return { ride, estimate, availableDrivers: drivers.length, matching: this.matching.getMatchingMeta() };
  }

  async searchDrivers(rideId: string, passengerId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== passengerId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (ride.status !== RideStatus.SEARCHING) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    const attempts = await this.prisma.rideEvent.count({ where: { rideId, event: 'SEARCH_ATTEMPT' } });
    const drivers = await this.matching.findDrivers(ride.pickupLat, ride.pickupLng, ride.vehicleType, attempts);
    await this.prisma.rideEvent.create({ data: { rideId, event: 'SEARCH_ATTEMPT', metadata: { attempt: attempts, driversFound: drivers.length } } });
    const meta = this.matching.getMatchingMeta(attempts);
    if (drivers.length === 0 && meta.radiusKm >= MARKET_RDC.matching.maxRadiusKm) throw new MovaHttpException(MovaErrorCode.RIDE_NO_DRIVERS);
    return { rideId, attempt: attempts, ...meta, drivers };
  }

  async acceptRide(rideId: string, driverUserId: string, vehicleId?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status !== RideStatus.SEARCHING) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    return this.prisma.ride.update({ where: { id: rideId }, data: { driverId: driverUserId, vehicleId, status: RideStatus.ACCEPTED, acceptedAt: new Date() } });
  }

  async updateStatus(rideId: string, status: RideStatus, userId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updates: Record<string, unknown> = { status };
    if (status === RideStatus.IN_PROGRESS) updates.startedAt = new Date();
    if (status === RideStatus.COMPLETED) updates.completedAt = new Date();
    if (status === RideStatus.CANCELLED) { updates.cancelledAt = new Date(); updates.cancelledBy = userId; }
    const updated = await this.prisma.ride.update({ where: { id: rideId }, data: updates });
    await this.prisma.rideEvent.create({ data: { rideId, event: status } });
    if (status === RideStatus.COMPLETED) await this.redis.publish(MOVA_EVENTS.RIDE_COMPLETED, { rideId, passengerId: ride.passengerId, driverId: ride.driverId });
    return updated;
  }

  async cancelRide(rideId: string, userId: string, reason?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const policy = await this.prisma.cancellationPolicy.findUnique({ where: { vehicleType: ride.vehicleType } });
    let feeCdf = 0;
    if (ride.acceptedAt && policy) {
      const minutesSinceAccept = (Date.now() - ride.acceptedAt.getTime()) / 60000;
      if (minutesSinceAccept > policy.freeCancelMinutes) feeCdf = policy.passengerFeeCdf;
    }
    const updated = await this.prisma.ride.update({ where: { id: rideId }, data: { status: RideStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason } });
    return { ride: updated, cancellationFeeCdf: feeCdf };
  }

  async getRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId }, include: { events: { orderBy: { createdAt: 'asc' } }, ratings: true } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return ride;
  }

  async getUserRides(userId: string, role: 'passenger' | 'driver') {
    return this.prisma.ride.findMany({ where: role === 'passenger' ? { passengerId: userId } : { driverId: userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async getDriverEarnings(driverUserId: string) {
    const rides = await this.prisma.ride.findMany({ where: { driverId: driverUserId, status: RideStatus.COMPLETED } });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sum = (from: Date) => rides.filter((r) => r.completedAt && r.completedAt >= from).reduce((a, r) => a + (r.finalFareCdf ?? r.estimatedFareCdf ?? 0), 0);
    return { totalCdf: sum(new Date(0)), todayCdf: sum(startOfDay), weekCdf: sum(startOfWeek), monthCdf: sum(startOfMonth), rideCount: rides.length };
  }

  async getStats() {
    const [rides, completed, revenue] = await Promise.all([
      this.prisma.ride.count(),
      this.prisma.ride.count({ where: { status: RideStatus.COMPLETED } }),
      this.prisma.ride.aggregate({ where: { status: RideStatus.COMPLETED }, _sum: { finalFareCdf: true, estimatedFareCdf: true } }),
    ]);
    return { rides, completed, revenueCdf: (revenue._sum.finalFareCdf ?? 0) + (revenue._sum.estimatedFareCdf ?? 0) };
  }
}
