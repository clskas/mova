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
  evaluateDriverDocuments,
  type DriverDocumentsStatus,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOnboardingDto } from './drivers.dto';
import { OcrService } from '../ocr/ocr.service';

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
  constructor(
    private prisma: PrismaService,
    private ocrService: OcrService,
  ) {}

  private documentsStatusFor(profile: {
    licenseExpiry?: Date | null;
    insuranceExpiry?: Date | null;
    technicalInspectionExpiry?: Date | null;
    documentsRenewalPending?: boolean;
    vehicles?: { typeApprovalStatus?: KycStatus; typeApprovalNotes?: string | null; isActive?: boolean }[];
  }): DriverDocumentsStatus {
    const activeVehicle = profile.vehicles?.find((v) => v.isActive !== false) ?? profile.vehicles?.[0];
    return evaluateDriverDocuments({
      licenseExpiry: profile.licenseExpiry,
      insuranceExpiry: profile.insuranceExpiry,
      technicalInspectionExpiry: profile.technicalInspectionExpiry,
      documentsRenewalPending: profile.documentsRenewalPending,
      vehicleTypeApprovalStatus: activeVehicle?.typeApprovalStatus,
      vehicleTypeApprovalNotes: activeVehicle?.typeApprovalNotes,
    });
  }

  private sameCalendarDay(a?: Date | null, b?: string | Date | null): boolean {
    if (!a && (b == null || b === '')) return true;
    if (!a || b == null || b === '') return false;
    const left = new Date(a);
    const right = new Date(b);
    if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate()
    );
  }

  private markDocumentsRenewalIfNeeded(
    profile: {
      kycStatus: KycStatus;
      licenseExpiry?: Date | null;
      insuranceExpiry?: Date | null;
      technicalInspectionExpiry?: Date | null;
    },
    dto: UpdateOnboardingDto,
    profileData: Record<string, unknown>,
  ) {
    if (profile.kycStatus !== KycStatus.APPROVED) return;
    const expiryChanged =
      (dto.licenseExpiry !== undefined && !this.sameCalendarDay(profile.licenseExpiry, dto.licenseExpiry)) ||
      (dto.insuranceExpiry !== undefined && !this.sameCalendarDay(profile.insuranceExpiry, dto.insuranceExpiry)) ||
      (dto.technicalInspectionExpiry !== undefined &&
        !this.sameCalendarDay(profile.technicalInspectionExpiry, dto.technicalInspectionExpiry));
    if (expiryChanged) {
      profileData.documentsRenewalPending = true;
      profileData.documentsRenewalRequestedAt = new Date();
    }
  }

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
        vehicles: { some: { type: { in: compatibleTypes }, isActive: true, typeApprovalStatus: KycStatus.APPROVED } },
      },
      include: { vehicles: { where: { type: { in: compatibleTypes }, isActive: true, typeApprovalStatus: KycStatus.APPROVED } } },
    });
    const candidates: DriverCandidate[] = [];
    for (const driver of drivers) {
      if (!this.documentsStatusFor(driver).canOperate) continue;
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
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: { vehicles: true },
    });
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
    const documentsStatus = this.documentsStatusFor(profile);
    if (isAvailable && !documentsStatus.canOperate) {
      throw new MovaHttpException(
        MovaErrorCode.DRIVER_DOCUMENTS_EXPIRED,
        undefined,
        documentsStatus.blockReason,
      );
    }
    return this.prisma.driverProfile.update({ where: { userId }, data: { isAvailable } });
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    const data: { currentLat: number; currentLng: number; operatingCity?: string } = {
      currentLat: lat,
      currentLng: lng,
    };
    // Ne pas écraser la ville d'exploitation à chaque ping GPS (évite les faux négatifs repas).
    if (!profile?.operatingCity?.trim()) {
      data.operatingCity = resolveCityFromCoords(lat, lng);
    }
    return this.prisma.driverProfile.update({ where: { userId }, data });
  }

  async uploadKyc(userId: string, type: string, url: string) {
    let docType: string;
    try {
      docType = normalizeKycDocumentType(type);
    } catch {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Type de document KYC invalide.');
    }
    const doc = await this.prisma.kycDocument.create({ data: { userId, type: docType, url } });
    this.ocrService.scheduleAnalysis(doc.id);
    const profile = await this.getOrCreateProfile(userId);
    if (profile) await this.ensureDefaultVehicle(profile.id);
    const renewalDocTypes = new Set([
      'DRIVERS_LICENSE',
      'VEHICLE_INSURANCE',
      'TECHNICAL_INSPECTION',
    ]);
    if (profile?.kycStatus === KycStatus.APPROVED) {
      if (renewalDocTypes.has(docType)) {
        await this.prisma.driverProfile.update({
          where: { userId },
          data: {
            documentsRenewalPending: true,
            documentsRenewalRequestedAt: new Date(),
          },
        });
      }
      return this.getOrCreateProfile(userId);
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

  private ocrFieldsFor(doc?: {
    ocrStatus?: string;
    ocrExtractedExpiry?: Date | null;
    ocrProfileExpiry?: Date | null;
    ocrConfidence?: number | null;
    ocrNotes?: string | null;
    ocrCheckedAt?: Date | null;
    id?: string;
  } | null) {
    if (!doc) return null;
    return {
      documentId: doc.id,
      status: doc.ocrStatus ?? 'PENDING',
      extractedExpiry: doc.ocrExtractedExpiry ?? null,
      profileExpiry: doc.ocrProfileExpiry ?? null,
      confidence: doc.ocrConfidence ?? null,
      notes: doc.ocrNotes ?? null,
      checkedAt: doc.ocrCheckedAt ?? null,
    };
  }

  async runKycOcr(documentId: string) {
    const doc = await this.prisma.kycDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Document KYC introuvable.');
    const updated = await this.ocrService.analyzeDocument(documentId);
    return {
      documentId,
      userId: doc.userId,
      type: doc.type,
      ocr: this.ocrFieldsFor(updated),
    };
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
        ocr: this.ocrFieldsFor(doc),
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
        documentsRenewalPending: profile?.documentsRenewalPending ?? false,
        documentsRenewalRequestedAt: profile?.documentsRenewalRequestedAt,
        documentsStatus: this.documentsStatusFor(profile ?? {}),
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
            imageUrl: vehicle.imageUrl,
            typeApprovalStatus: vehicle.typeApprovalStatus,
            typeApprovalNotes: vehicle.typeApprovalNotes,
            typeApprovedAt: vehicle.typeApprovedAt,
          }
        : null,
      vehicleTypeApprovalStatus: vehicle?.typeApprovalStatus,
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

    this.markDocumentsRenewalIfNeeded(profile, dto, profileData);

    await this.prisma.driverProfile.update({ where: { userId }, data: profileData });

    if (dto.plateNumber || dto.vehicleMake || dto.vehicleModel || dto.vehicleType || dto.vehicleColor || dto.vehicleImageUrl) {
      const vehicle = profile.vehicles.find((v) => v.isActive) ?? profile.vehicles[0];
      if (vehicle) {
        const typeOrPhotoChanged = dto.vehicleType !== undefined || dto.vehicleImageUrl !== undefined;
        await this.prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
            ...(dto.vehicleMake !== undefined ? { make: dto.vehicleMake } : {}),
            ...(dto.vehicleModel !== undefined ? { model: dto.vehicleModel } : {}),
            ...(dto.vehicleType !== undefined ? { type: dto.vehicleType } : {}),
            ...(dto.vehicleColor !== undefined ? { color: dto.vehicleColor } : {}),
            ...(dto.vehicleImageUrl !== undefined ? { imageUrl: dto.vehicleImageUrl } : {}),
            ...(typeOrPhotoChanged
              ? { typeApprovalStatus: KycStatus.PENDING, typeApprovalNotes: null, typeApprovedAt: null }
              : {}),
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

  async reviewDocumentsRenewal(userId: string, approved: boolean, notes?: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: { vehicles: true },
    });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    if (!profile.documentsRenewalPending) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Aucun renouvellement de documents en attente pour ce chauffeur.',
      );
    }
    if (!approved) {
      await this.prisma.driverProfile.update({
        where: { userId },
        data: { isAvailable: false },
      });
      return {
        userId,
        documentsRenewalPending: true,
        approved: false,
        notes: notes ?? null,
        message: 'Renouvellement refusé — le chauffeur reste bloqué jusqu’à correction.',
      };
    }
    const nextProfile = {
      ...profile,
      documentsRenewalPending: false,
    };
    const documentsStatus = this.documentsStatusFor(nextProfile);
    if (!documentsStatus.valid) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        documentsStatus.blockReason ?? 'Les dates saisies ne sont pas encore valides.',
      );
    }
    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: { documentsRenewalPending: false },
      include: { vehicles: true },
    });
    return {
      userId,
      documentsRenewalPending: false,
      approved: true,
      notes: notes ?? null,
      documentsStatus: this.documentsStatusFor(updated),
      message: 'Renouvellement validé — le chauffeur peut repasser en ligne.',
    };
  }

  async reviewVehicleTypeApproval(userId: string, approved: boolean, notes?: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: { vehicles: true },
    });
    if (!profile) throw new MovaHttpException(MovaErrorCode.DRIVER_KYC_PENDING);
    const vehicle = profile.vehicles.find((v) => v.isActive) ?? profile.vehicles[0];
    if (!vehicle) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Aucun véhicule enregistré pour ce chauffeur.',
      );
    }
    const status = approved ? KycStatus.APPROVED : KycStatus.REJECTED;
    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        typeApprovalStatus: status,
        typeApprovalNotes: notes?.trim() || null,
        typeApprovedAt: approved ? new Date() : null,
      },
    });
    if (!approved) {
      await this.prisma.driverProfile.update({ where: { userId }, data: { isAvailable: false } });
    }
    const refreshed = await this.getOrCreateProfile(userId);
    const documentsStatus = this.documentsStatusFor(refreshed ?? { vehicles: [] });
    return {
      userId,
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      typeApprovalStatus: status,
      typeApprovalNotes: notes?.trim() || null,
      documentsStatus,
      message: approved
        ? 'Type d\'engin validé — le chauffeur peut passer en ligne si le reste du dossier est conforme.'
        : 'Type d\'engin refusé — le chauffeur doit corriger sa déclaration ou sa photo.',
    };
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
    await this.prisma.driverProfile.update({
      where: { userId },
      data: { activationPinVerifiedAt: new Date() },
    });
    return this.getProfileWithUser(userId);
  }

  async getProfileWithUser(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const documentsStatus = this.documentsStatusFor(profile);
    if (!documentsStatus.canOperate && profile.isAvailable) {
      await this.prisma.driverProfile.update({ where: { userId }, data: { isAvailable: false } });
      profile.isAvailable = false;
    }
    const user = await this.fetchAuthUser(userId);
    const pinVerified = !!profile?.activationPinVerifiedAt;
    return {
      ...profile,
      publicId: formatMovaPublicId(userId, 'DRIVER'),
      user,
      activationPinVerified: pinVerified,
      needsActivationPin: profile?.kycStatus === KycStatus.APPROVED && !pinVerified,
      documentsRenewalPending: profile?.documentsRenewalPending ?? false,
      documentsRenewalRequestedAt: profile?.documentsRenewalRequestedAt,
      documentsStatus,
    };
  }

  private generateActivationPin() {
    return crypto.randomInt(100000, 999999).toString();
  }

  private async applyKycApproval(userId: string) {
    const pin = this.generateActivationPin();
    const now = new Date();
    const defaultExpiry = new Date(now);
    defaultExpiry.setUTCFullYear(defaultExpiry.getUTCFullYear() + 2);
    const existing = await this.prisma.driverProfile.findUnique({ where: { userId } });
    await this.prisma.driverProfile.upsert({
      where: { userId },
      create: {
        userId,
        kycStatus: KycStatus.APPROVED,
        activationPin: pin,
        activationPinVerifiedAt: null,
        licenseExpiry: defaultExpiry,
        insuranceExpiry: defaultExpiry,
        technicalInspectionExpiry: defaultExpiry,
      },
      update: {
        kycStatus: KycStatus.APPROVED,
        activationPin: pin,
        activationPinVerifiedAt: null,
        ...(existing?.licenseExpiry == null ? { licenseExpiry: defaultExpiry } : {}),
        ...(existing?.insuranceExpiry == null ? { insuranceExpiry: defaultExpiry } : {}),
        ...(existing?.technicalInspectionExpiry == null ? { technicalInspectionExpiry: defaultExpiry } : {}),
      },
    });
    await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({ status: 'ACTIVE' }),
    }).catch((e) => this.logger.warn(`Could not activate auth user ${userId}`, e));
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (profile) {
      await this.ensureDefaultVehicle(profile.id);
      await this.prisma.vehicle.updateMany({
        where: { driverProfileId: profile.id, isActive: true, typeApprovalStatus: KycStatus.PENDING },
        data: { typeApprovalStatus: KycStatus.APPROVED, typeApprovedAt: now, typeApprovalNotes: null },
      });
    }
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

    const profile = await this.getOrCreateProfile(userId);

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
      payoutProvider: profile?.payoutProvider ?? null,
      payoutPhone: profile?.payoutPhone ?? null,
      payoutPhoneMasked: profile?.payoutPhone ? maskPhoneRdc(profile.payoutPhone) : null,
      payoutConfigured: !!profile?.payoutPhone,
      minWithdrawCdf: 500,
    };
  }

  async getEarningsActivity(
    userId: string,
    query: { from?: string; to?: string; type?: string; q?: string; skip?: number; take?: number },
  ) {
    const params = new URLSearchParams();
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.type) params.set('type', query.type);
    if (query.q) params.set('q', query.q);
    params.set('skip', String(query.skip ?? 0));
    params.set('take', String(Math.min(query.take ?? 50, 100)));

    const url = serviceUrl('ride', `/internal/rides/driver/${userId}/payout-items?${params.toString()}`);
    try {
      const res = await fetch(url, { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
      if (!res.ok) return { items: [], pagination: { total: 0, skip: 0, take: 50 }, summary: { netCdf: 0, count: 0 } };
      return res.json();
    } catch {
      return { items: [], pagination: { total: 0, skip: 0, take: 50 }, summary: { netCdf: 0, count: 0 } };
    }
  }

  async withdraw(userId: string, amountCdf: number) {
    const profile = await this.getOrCreateProfile(userId);
    const payoutPhone = profile?.payoutPhone?.trim();
    const payoutProvider = profile?.payoutProvider?.trim() || 'ORANGE_MONEY';
    if (!payoutPhone) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Configurez votre numéro Mobile Money dans Mon dossier (étape Paiement).',
      );
    }

    await fetch(serviceUrl('payment', `/internal/driver-payouts/sync/${userId}`), {
      method: 'POST',
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
    }).catch(() => undefined);

    let res: Response;
    try {
      res = await fetch(serviceUrl('payment', `/internal/wallets/${userId}/withdraw`), {
        method: 'POST',
        headers: {
          'x-internal-api-key': INTERNAL_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amountCdf, provider: payoutProvider, phone: payoutPhone }),
      });
    } catch {
      throw new MovaHttpException(MovaErrorCode.INTERNAL_ERROR, undefined, 'Service paiement indisponible.');
    }

    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: { message?: string; code?: string };
      balanceCdf?: number;
      amountCdf?: number;
      provider?: string;
      phoneMasked?: string;
      reference?: string;
    };

    if (!res.ok) {
      const msg = body.error?.message ?? body.message ?? 'Retrait impossible.';
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, msg);
    }

    return {
      success: true,
      message: body.message ?? `Retrait de ${amountCdf} FC en cours vers ${maskPhoneRdc(payoutPhone)}`,
      amountCdf: body.amountCdf ?? amountCdf,
      provider: body.provider ?? payoutProvider,
      phoneMasked: body.phoneMasked ?? maskPhoneRdc(payoutPhone),
      balanceCdf: body.balanceCdf,
      reference: body.reference,
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

  async getAdminStats() {
    const [total, available, pendingKyc, approved] = await Promise.all([
      this.prisma.driverProfile.count(),
      this.prisma.driverProfile.count({ where: { isAvailable: true, kycStatus: KycStatus.APPROVED } }),
      this.prisma.driverProfile.count({ where: { kycStatus: KycStatus.PENDING } }),
      this.prisma.driverProfile.count({ where: { kycStatus: KycStatus.APPROVED } }),
    ]);
    return { total, available, pendingKyc, approved };
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
      const documentsStatus = this.documentsStatusFor(p);
      return {
        ...p,
        publicId: formatMovaPublicId(p.userId, 'DRIVER'),
        activationPinVerified: !!p.activationPinVerifiedAt,
        ...kycSummary,
        readyForReview: p.onboardingCompleted && p.kycStatus === KycStatus.PENDING,
        documentsStatus,
        documentsCanOperate: documentsStatus.canOperate,
        documentsRenewalPending: p.documentsRenewalPending ?? false,
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
    const documentsStatus = profile ? this.documentsStatusFor(profile) : evaluateDriverDocuments({});
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
      documentsRenewalPending: profile?.documentsRenewalPending ?? false,
      documentsRenewalRequestedAt: profile?.documentsRenewalRequestedAt,
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
            imageUrl: vehicle.imageUrl,
            typeApprovalStatus: vehicle.typeApprovalStatus,
            typeApprovalNotes: vehicle.typeApprovalNotes,
            typeApprovedAt: vehicle.typeApprovedAt,
          }
        : null,
      vehicleTypeApprovalPending: vehicle?.typeApprovalStatus === KycStatus.PENDING,
      vehicleTypeApprovalStatus: vehicle?.typeApprovalStatus,
      kyc,
      createdAt: profile?.createdAt,
      documentsStatus,
      documentsCanOperate: documentsStatus.canOperate,
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
