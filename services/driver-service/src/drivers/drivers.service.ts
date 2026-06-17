import { Injectable, Logger } from '@nestjs/common';
import { KycStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, INTERNAL_API_KEY, resolveCityFromCoords, serviceUrl, MARKET_RDC } from '@mova/shared';
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
    const profile = await this.prisma.driverProfile.upsert({
      where: { userId },
      create: { userId, operatingCity: 'Kinshasa' },
      update: {},
    });
    await this.ensureDefaultVehicle(profile.id);
    return this.prisma.driverProfile.findUnique({ where: { userId }, include: { vehicles: true } });
  }

  private async ensureDefaultVehicle(driverProfileId: string) {
    const existing = await this.prisma.vehicle.findFirst({ where: { driverProfileId } });
    if (existing) return existing;
    return this.prisma.vehicle.create({
      data: {
        driverProfileId,
        type: VehicleType.STANDARD,
        make: 'Toyota',
        model: 'Corolla',
        plateNumber: `KIN-${driverProfileId.slice(0, 4).toUpperCase()}`,
        color: 'Noir',
        isActive: true,
      },
    });
  }

  async getOrCreateProfile(userId: string) {
    let profile = await this.prisma.driverProfile.findUnique({ where: { userId }, include: { vehicles: true } });
    if (!profile) {
      profile = await this.createProfile(userId);
    } else if (!profile.vehicles.length) {
      await this.ensureDefaultVehicle(profile.id);
      profile = await this.prisma.driverProfile.findUnique({ where: { userId }, include: { vehicles: true } });
    }
    return profile;
  }

  async findNearby(lat: number, lng: number, vehicleType: VehicleType, searchAttempt = 0, city?: string): Promise<DriverCandidate[]> {
    const effectiveRadius = Math.min(
      MARKET_RDC.matching.initialRadiusKm + searchAttempt * MARKET_RDC.matching.radiusIncrementKm,
      MARKET_RDC.matching.maxRadiusKm,
    );
    const pickupCity = city ?? resolveCityFromCoords(lat, lng);
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
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
      const sameCity = driver.operatingCity === pickupCity;
      const rating = driver.ratingAvg;
      const baseScore = this.computeScore(distanceKm, rating, driver.totalRides);
      candidates.push({
        driverId: driver.id,
        userId: driver.userId,
        lat: driver.currentLat,
        lng: driver.currentLng,
        rating,
        distanceKm,
        score: sameCity ? baseScore : baseScore * 0.85,
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
    const operatingCity = resolveCityFromCoords(lat, lng);
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { currentLat: lat, currentLng: lng, operatingCity },
    });
  }

  async uploadKyc(userId: string, type: string, url: string) {
    await this.prisma.kycDocument.create({ data: { userId, type, url } });
    const profile = await this.getOrCreateProfile(userId);
    if (profile) await this.ensureDefaultVehicle(profile.id);
    if (profile?.kycStatus === KycStatus.APPROVED) {
      return profile;
    }
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { kycStatus: KycStatus.PENDING },
    });
  }

  async getProfile(userId: string) {
    return this.getOrCreateProfile(userId);
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
    const doc = await this.prisma.kycDocument.update({
      where: { id: documentId },
      data: { status: approved ? KycStatus.APPROVED : KycStatus.REJECTED, notes },
    });
    if (approved) {
      await this.prisma.kycDocument.updateMany({
        where: { userId: doc.userId, status: KycStatus.PENDING },
        data: { status: KycStatus.APPROVED },
      });
      await this.prisma.driverProfile.upsert({
        where: { userId: doc.userId },
        create: { userId: doc.userId, kycStatus: KycStatus.APPROVED },
        update: { kycStatus: KycStatus.APPROVED },
      });
    } else {
      const approvedCount = await this.prisma.kycDocument.count({
        where: { userId: doc.userId, status: KycStatus.APPROVED },
      });
      if (approvedCount === 0) {
        await this.prisma.driverProfile.upsert({
          where: { userId: doc.userId },
          create: { userId: doc.userId, kycStatus: KycStatus.REJECTED },
          update: { kycStatus: KycStatus.REJECTED },
        });
      }
    }
    return doc;
  }

  /** Valide ou rejette le KYC d'un chauffeur (profil + tous les documents). */
  async setDriverKycStatus(userId: string, approved: boolean, notes?: string) {
    const status = approved ? KycStatus.APPROVED : KycStatus.REJECTED;
    await this.prisma.kycDocument.updateMany({
      where: { userId },
      data: { status, ...(notes ? { notes } : {}) },
    });
    const profile = await this.prisma.driverProfile.upsert({
      where: { userId },
      create: { userId, kycStatus: status },
      update: { kycStatus: status },
    });
    if (approved) {
      await this.ensureDefaultVehicle(profile.id);
    }
    return this.prisma.driverProfile.findUnique({ where: { userId }, include: { vehicles: true } });
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
