import { Injectable, Logger } from '@nestjs/common';
import { KycStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, INTERNAL_API_KEY, resolveCityFromCoords, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface DriverCandidate {
  driverId: string;
  userId: string;
  lat: number;
  lng: number;
  rating: number;
  distanceKm: number;
  score: number;
  vehicleId?: string;
}

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);
  constructor(private prisma: PrismaService) {}

  async createProfile(userId: string) {
    return this.prisma.driverProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async findNearby(lat: number, lng: number, vehicleType: VehicleType, searchAttempt = 0, city?: string): Promise<DriverCandidate[]> {
    const effectiveRadius = Math.min(
      MARKET_RDC.matching.initialRadiusKm + searchAttempt * MARKET_RDC.matching.radiusIncrementKm,
      MARKET_RDC.matching.maxRadiusKm,
    );
    const operatingCity = city ?? resolveCityFromCoords(lat, lng);
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        operatingCity,
        isAvailable: true,
        kycStatus: KycStatus.APPROVED,
        currentLat: { not: null },
        currentLng: { not: null },
        vehicles: { some: { type: vehicleType, isActive: true } },
      },
      include: { vehicles: { where: { type: vehicleType, isActive: true } } },
    });
    const candidates: DriverCandidate[] = [];
    for (const driver of drivers) {
      if (driver.currentLat == null || driver.currentLng == null) continue;
      const distanceKm = this.haversineKm(lat, lng, driver.currentLat, driver.currentLng);
      if (distanceKm > effectiveRadius) continue;
      candidates.push({
        driverId: driver.id,
        userId: driver.userId,
        lat: driver.currentLat,
        lng: driver.currentLng,
        rating: driver.ratingAvg,
        distanceKm,
        score: this.computeScore(distanceKm, driver.ratingAvg, driver.totalRides),
        vehicleId: driver.vehicles[0]?.id,
      });
    }
    return candidates.sort((a, b) => b.score - a.score);
  }

  async setAvailability(userId: string, isAvailable: boolean) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    if (profile.kycStatus !== KycStatus.APPROVED && isAvailable) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    return this.prisma.driverProfile.update({ where: { userId }, data: { isAvailable } });
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    return this.prisma.driverProfile.update({ where: { userId }, data: { currentLat: lat, currentLng: lng } });
  }

  async uploadKyc(userId: string, type: string, url: string) {
    await this.prisma.kycDocument.create({ data: { userId, type, url } });
    return this.prisma.driverProfile.upsert({ where: { userId }, create: { userId, kycStatus: KycStatus.PENDING }, update: { kycStatus: KycStatus.PENDING } });
  }

  async getProfile(userId: string) {
    return this.prisma.driverProfile.findUnique({ where: { userId }, include: { vehicles: true } });
  }

  async getEarnings(userId: string) {
    const res = await fetch(serviceUrl('ride', `/internal/rides/driver/${userId}/earnings`), { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
    if (!res.ok) return { totalCdf: 0, todayCdf: 0, weekCdf: 0, monthCdf: 0, rideCount: 0 };
    return res.json();
  }

  async pendingKyc() {
    return this.prisma.kycDocument.findMany({ where: { status: KycStatus.PENDING }, orderBy: { createdAt: 'desc' } });
  }

  async approveKyc(documentId: string, approved: boolean, notes?: string) {
    const doc = await this.prisma.kycDocument.update({ where: { id: documentId }, data: { status: approved ? KycStatus.APPROVED : KycStatus.REJECTED, notes } });
    if (approved) await this.prisma.driverProfile.update({ where: { userId: doc.userId }, data: { kycStatus: KycStatus.APPROVED } });
    return doc;
  }

  async updateRating(userId: string, ratingAvg: number) {
    return this.prisma.driverProfile.update({ where: { userId }, data: { ratingAvg } });
  }

  async countDrivers() {
    return this.prisma.driverProfile.count();
  }

  async listDriversAdmin(
    skip = 0,
    take = 50,
    filters?: { kycStatus?: KycStatus; isAvailable?: boolean },
  ) {
    const where = {
      ...(filters?.kycStatus ? { kycStatus: filters.kycStatus } : {}),
      ...(filters?.isAvailable !== undefined ? { isAvailable: filters.isAvailable } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.driverProfile.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { vehicles: true },
      }),
      this.prisma.driverProfile.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  async updateDriverAdmin(userId: string, data: { isAvailable?: boolean; active?: boolean }) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    if (data.active !== undefined) return this.setDriverActive(userId, data.active);
    if (data.isAvailable !== undefined) return this.setAvailability(userId, data.isAvailable);
    return profile;
  }

  async setDriverActive(userId: string, active: boolean) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { isAvailable: active && profile.kycStatus === KycStatus.APPROVED },
    });
  }

  private computeScore(distanceKm: number, rating: number, totalRides: number, acceptanceRate = 0.85): number {
    const w = MARKET_RDC.matching.scoreWeights;
    const proximityScore = Math.max(0, 1 - distanceKm / MARKET_RDC.matching.maxRadiusKm);
    const ratingScore = rating / 5;
    const acceptanceScore = Math.min(1, acceptanceRate);
    const seniorityScore = Math.min(1, totalRides / 500);
    return (
      w.proximity * proximityScore +
      w.rating * ratingScore +
      w.acceptanceRate * acceptanceScore +
      w.seniority * seniorityScore
    );
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
