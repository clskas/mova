import { Injectable, Logger } from '@nestjs/common';
import { KycStatus, VehicleType } from '@prisma/client';
import * as crypto from 'crypto';
import {
  MovaErrorCode,
  MovaHttpException,
  INTERNAL_API_KEY,
  resolveCityFromCoords,
  serviceUrl,
  MARKET_RDC,
  KYC_DOCUMENT_LABELS,
  REQUIRED_DRIVER_KYC_TYPES,
  OPTIONAL_DRIVER_KYC_TYPES,
  normalizeKycDocumentType,
  driverVehicleTypesForRide,
  formatMovaPublicId,
  maskPhoneRdc,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOnboardingDto } from './drivers.dto';

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
    const compatibleTypes = driverVehicleTypesForRide(vehicleType) as VehicleType[];
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        isAvailable: true,
        kycStatus: KycStatus.APPROVED,
        currentLat: { not: null },
        currentLng: { not: null },
        vehicles: { some: { type: { in: compatibleTypes }, isActive: true } },
      },
      include: { vehicles: { where: { type: { in: compatibleTypes }, isActive: true } } },
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
    if (profile.kycStatus !== KycStatus.APPROVED && isAvailable) {
      throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    }
    if (profile.kycStatus === KycStatus.APPROVED && !profile.activationPinVerifiedAt && isAvailable) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Activez votre compte avec le code PIN reçu après validation MOVA.',
      );
    }
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
    let docType: string;
    try {
      docType = normalizeKycDocumentType(type);
    } catch {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Type de document KYC invalide.');
    }
    await this.prisma.kycDocument.create({ data: { userId, type: docType, url } });
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

  private async fetchAuthUser(userId: string) {
    try {
      const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return res.json() as Promise<{
        id: string;
        phone: string;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        role: string;
      }>;
    } catch {
      return null;
    }
  }

  async getKycStatus(userId: string) {
    const docs = await this.prisma.kycDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const latestByType = new Map<string, (typeof docs)[number]>();
    for (const doc of docs) {
      try {
        const key = normalizeKycDocumentType(doc.type);
        if (!latestByType.has(key)) latestByType.set(key, doc);
      } catch {
        /* legacy unknown type */
      }
    }
    const checklist = [...REQUIRED_DRIVER_KYC_TYPES, ...OPTIONAL_DRIVER_KYC_TYPES].map((type) => {
      const doc = latestByType.get(type);
      return {
        type,
        label: KYC_DOCUMENT_LABELS[type],
        required: REQUIRED_DRIVER_KYC_TYPES.includes(type),
        uploaded: !!doc,
        status: doc?.status ?? null,
        url: doc?.url ?? null,
      };
    });
    const requiredComplete = REQUIRED_DRIVER_KYC_TYPES.every((t) => latestByType.has(t));
    return { documents: docs, checklist, requiredComplete };
  }

  async getOnboarding(userId: string) {
    const [profile, kyc, user] = await Promise.all([
      this.getOrCreateProfile(userId),
      this.getKycStatus(userId),
      this.fetchAuthUser(userId),
    ]);
    const vehicle = profile?.vehicles.find((v) => v.isActive) ?? profile?.vehicles[0];
    const publicId = formatMovaPublicId(userId, 'DRIVER');
    return {
      publicId,
      user: user
        ? {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            phoneMasked: maskPhoneRdc(user.phone),
          }
        : null,
      profile: {
        licenseNumber: profile?.licenseNumber,
        idDocumentNumber: profile?.idDocumentNumber,
        licenseExpiry: profile?.licenseExpiry,
        insuranceExpiry: profile?.insuranceExpiry,
        technicalInspectionExpiry: profile?.technicalInspectionExpiry,
        payoutProvider: profile?.payoutProvider,
        payoutPhone: profile?.payoutPhone,
        charterAcceptedAt: profile?.charterAcceptedAt,
        trainingCompletedAt: profile?.trainingCompletedAt,
        onboardingCompleted: profile?.onboardingCompleted ?? false,
        kycStatus: profile?.kycStatus,
        activationPinVerified: !!profile?.activationPinVerifiedAt,
        needsActivationPin: profile?.kycStatus === KycStatus.APPROVED && !profile?.activationPinVerifiedAt,
      },
      vehicle: vehicle
        ? {
            id: vehicle.id,
            type: vehicle.type,
            make: vehicle.make,
            model: vehicle.model,
            plateNumber: vehicle.plateNumber,
            color: vehicle.color,
          }
        : null,
      kyc,
    };
  }

  async updateOnboarding(userId: string, dto: UpdateOnboardingDto) {
    const profile = await this.getOrCreateProfile(userId);
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);

    const profileData: Record<string, unknown> = {};
    if (dto.licenseNumber !== undefined) profileData.licenseNumber = dto.licenseNumber;
    if (dto.idDocumentNumber !== undefined) profileData.idDocumentNumber = dto.idDocumentNumber;
    if (dto.licenseExpiry !== undefined) profileData.licenseExpiry = new Date(dto.licenseExpiry);
    if (dto.insuranceExpiry !== undefined) profileData.insuranceExpiry = new Date(dto.insuranceExpiry);
    if (dto.technicalInspectionExpiry !== undefined) {
      profileData.technicalInspectionExpiry = new Date(dto.technicalInspectionExpiry);
    }
    if (dto.payoutProvider !== undefined) profileData.payoutProvider = dto.payoutProvider;
    if (dto.payoutPhone !== undefined) profileData.payoutPhone = dto.payoutPhone;
    if (dto.charterAccepted === true) profileData.charterAcceptedAt = new Date();
    if (dto.trainingCompleted === true) profileData.trainingCompletedAt = new Date();
    if (dto.onboardingCompleted === true) profileData.onboardingCompleted = true;

    await this.prisma.driverProfile.update({ where: { userId }, data: profileData });

    if (dto.plateNumber || dto.vehicleMake || dto.vehicleModel || dto.vehicleType || dto.vehicleColor) {
      const vehicle = profile.vehicles.find((v) => v.isActive) ?? profile.vehicles[0];
      if (vehicle) {
        await this.prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
            ...(dto.vehicleMake !== undefined ? { make: dto.vehicleMake } : {}),
            ...(dto.vehicleModel !== undefined ? { model: dto.vehicleModel } : {}),
            ...(dto.vehicleType !== undefined ? { type: dto.vehicleType } : {}),
            ...(dto.vehicleColor !== undefined ? { color: dto.vehicleColor } : {}),
          },
        });
      }
    }

    if (dto.onboardingCompleted) {
      await this.prisma.driverProfile.update({
        where: { userId },
        data: { kycStatus: KycStatus.PENDING },
      });
    }

    return this.getOnboarding(userId);
  }

  async verifyActivationPin(userId: string, pin: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    if (profile.kycStatus !== KycStatus.APPROVED) {
      throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING, undefined, 'KYC non encore approuvé.');
    }
    if (!profile.activationPin || profile.activationPin !== pin.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Code PIN incorrect.');
    }
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { activationPinVerifiedAt: new Date() },
    });
  }

  async getProfileWithUser(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const user = await this.fetchAuthUser(userId);
    const pinVerified = !!profile?.activationPinVerifiedAt;
    return {
      ...profile,
      publicId: formatMovaPublicId(userId, 'DRIVER'),
      user,
      activationPinVerified: pinVerified,
      needsActivationPin: profile?.kycStatus === KycStatus.APPROVED && !pinVerified,
    };
  }

  private generateActivationPin() {
    return crypto.randomInt(100000, 999999).toString();
  }

  private async applyKycApproval(userId: string) {
    const pin = this.generateActivationPin();
    await this.prisma.driverProfile.upsert({
      where: { userId },
      create: { userId, kycStatus: KycStatus.APPROVED, activationPin: pin, activationPinVerifiedAt: null },
      update: { kycStatus: KycStatus.APPROVED, activationPin: pin, activationPinVerifiedAt: null },
    });
    await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ status: 'ACTIVE' }),
    }).catch((e) => this.logger.warn(`Could not activate auth user ${userId}`, e));
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (profile) await this.ensureDefaultVehicle(profile.id);
    return pin;
  }

  async getProfile(userId: string) {
    return this.getOrCreateProfile(userId);
  }

  async getEarnings(userId: string) {
    await fetch(serviceUrl('payment', `/internal/driver-payouts/sync/${userId}`), {
      method: 'POST',
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    }).catch(() => undefined);

    const fetchJson = async (url: string) => {
      try {
        const res = await fetch(url, { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    };

    const [earnings, wallet] = await Promise.all([
      fetchJson(serviceUrl('ride', `/internal/rides/driver/${userId}/earnings`)),
      fetchJson(serviceUrl('payment', `/internal/wallets/${userId}`)),
    ]);

    const earningsData = earnings ?? {
      totalCdf: 0,
      todayCdf: 0,
      weekCdf: 0,
      monthCdf: 0,
      rideCount: 0,
      deliveryCount: 0,
      rideEarningsCdf: 0,
      deliveryEarningsCdf: 0,
    };
    const walletData = wallet ?? { balanceCdf: 0 };

    return {
      ...earningsData,
      walletBalanceCdf: walletData.balanceCdf ?? 0,
      withdrawableCdf: walletData.balanceCdf ?? 0,
      currency: 'CDF',
    };
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
      const activationPin = await this.applyKycApproval(doc.userId);
      return { ...doc, activationPin };
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

  async setDriverKycStatus(userId: string, approved: boolean, notes?: string) {
    const status = approved ? KycStatus.APPROVED : KycStatus.REJECTED;
    await this.prisma.kycDocument.updateMany({
      where: { userId },
      data: { status, ...(notes ? { notes } : {}) },
    });
    let activationPin: string | undefined;
    if (approved) {
      activationPin = await this.applyKycApproval(userId);
    } else {
      await this.prisma.driverProfile.upsert({
        where: { userId },
        create: { userId, kycStatus: status },
        update: { kycStatus: status, activationPin: null, activationPinVerifiedAt: null },
      });
    }
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId }, include: { vehicles: true } });
    return { ...profile, activationPin };
  }

  async updateRating(userId: string, ratingAvg: number) {
    return this.prisma.driverProfile.update({ where: { userId }, data: { ratingAvg } });
  }

  async countDrivers() {
    return this.prisma.driverProfile.count();
  }

  async regenerateActivationPin(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    if (profile.kycStatus !== KycStatus.APPROVED) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Le KYC doit être approuvé avant de générer un PIN.',
      );
    }
    const pin = this.generateActivationPin();
    await this.prisma.driverProfile.update({
      where: { userId },
      data: { activationPin: pin, activationPinVerifiedAt: null },
    });
    return { activationPin: pin, userId, publicId: formatMovaPublicId(userId, 'DRIVER') };
  }

  private kycUploadSummary(userId: string, docs: { userId: string; type: string }[]) {
    const userDocs = docs.filter((d) => d.userId === userId);
    const types = new Set<string>();
    for (const doc of userDocs) {
      try {
        types.add(normalizeKycDocumentType(doc.type));
      } catch {
        /* legacy */
      }
    }
    const uploadedRequired = REQUIRED_DRIVER_KYC_TYPES.filter((t) => types.has(t)).length;
    return {
      kycDocumentsUploaded: uploadedRequired,
      kycDocumentsRequired: REQUIRED_DRIVER_KYC_TYPES.length,
      kycDocumentsComplete: REQUIRED_DRIVER_KYC_TYPES.every((t) => types.has(t)),
    };
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
    const [rows, total] = await Promise.all([
      this.prisma.driverProfile.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { vehicles: true },
      }),
      this.prisma.driverProfile.count({ where }),
    ]);
    const userIds = rows.map((p) => p.userId);
    const allDocs =
      userIds.length > 0
        ? await this.prisma.kycDocument.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, type: true },
          })
        : [];
    const data = rows.map((p) => {
      const kycSummary = this.kycUploadSummary(p.userId, allDocs);
      return {
        ...p,
        publicId: formatMovaPublicId(p.userId, 'DRIVER'),
        activationPinVerified: !!p.activationPinVerifiedAt,
        ...kycSummary,
        readyForReview: p.onboardingCompleted && p.kycStatus === KycStatus.PENDING,
      };
    });
    return { data, total, skip, take };
  }

  async getDriverAdminDetail(userId: string) {
    const [profile, kyc, user] = await Promise.all([
      this.getOrCreateProfile(userId),
      this.getKycStatus(userId),
      this.fetchAuthUser(userId),
    ]);
    const vehicle = profile?.vehicles.find((v) => v.isActive) ?? profile?.vehicles[0];
    return {
      id: profile?.id,
      userId,
      publicId: formatMovaPublicId(userId, 'DRIVER'),
      user: user
        ? {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            phoneMasked: maskPhoneRdc(user.phone),
          }
        : null,
      licenseNumber: profile?.licenseNumber,
      idDocumentNumber: profile?.idDocumentNumber,
      licenseExpiry: profile?.licenseExpiry,
      insuranceExpiry: profile?.insuranceExpiry,
      technicalInspectionExpiry: profile?.technicalInspectionExpiry,
      payoutProvider: profile?.payoutProvider,
      payoutPhone: profile?.payoutPhone,
      charterAcceptedAt: profile?.charterAcceptedAt,
      trainingCompletedAt: profile?.trainingCompletedAt,
      onboardingCompleted: profile?.onboardingCompleted ?? false,
      kycStatus: profile?.kycStatus,
      isAvailable: profile?.isAvailable,
      ratingAvg: profile?.ratingAvg,
      totalRides: profile?.totalRides,
      activationPinVerified: !!profile?.activationPinVerifiedAt,
      activationPinVerifiedAt: profile?.activationPinVerifiedAt,
      activationPin:
        profile?.kycStatus === KycStatus.APPROVED && profile?.activationPin ? profile.activationPin : undefined,
      activationPinPending: profile?.kycStatus === KycStatus.APPROVED && !profile?.activationPinVerifiedAt,
      canGenerateActivationPin:
        profile?.kycStatus === KycStatus.APPROVED && !profile?.activationPinVerifiedAt,
      readyForReview: profile?.onboardingCompleted && profile?.kycStatus === KycStatus.PENDING,
      kycDocumentsUploaded: kyc.checklist.filter((c) => c.required && c.uploaded).length,
      kycDocumentsRequired: kyc.checklist.filter((c) => c.required).length,
      kycDocumentsComplete: kyc.requiredComplete,
      vehicles: profile?.vehicles ?? [],
      vehicle: vehicle
        ? {
            id: vehicle.id,
            type: vehicle.type,
            make: vehicle.make,
            model: vehicle.model,
            plateNumber: vehicle.plateNumber,
            color: vehicle.color,
          }
        : null,
      kyc,
      createdAt: profile?.createdAt,
    };
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
