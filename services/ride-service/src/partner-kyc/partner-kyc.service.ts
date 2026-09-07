import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PartnerKycStatus, PartnerKycSubject, RentalPartnerType } from '@prisma/client';
import {
  INTERNAL_API_KEY,
  MovaErrorCode,
  MovaHttpException,
  normalizeKycRejectNotes,
  normalizePartnerKycDocumentType,
  kycDocumentLabel,
  kycPartnerKindLabel,
  rentalKycPartnerKind,
  rentalKycTypes,
  restaurantKycTypes,
  serviceUrl,
  type KycPartnerKind,
  type PartnerKycSubject as PartnerSubject,
  type RentalPartnerKind,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';

const PHONE_OK = /^\+243\d{9}$/;

export type IssueLoginPinResult = {
  loginPin?: string;
  smsSent?: boolean;
  emailSent?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
  smsError?: string;
  emailError?: string;
};

@Injectable()
export class PartnerKycService {
  private readonly logger = new Logger(PartnerKycService.name);

  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  async getRestaurantDossier(ownerUserId: string) {
    const restaurant = await this.ensureRestaurant(ownerUserId);
    const user = await fetchAuthUserBrief(ownerUserId);
    const types = restaurantKycTypes();
    const checklist = await this.buildChecklist(ownerUserId, PartnerKycSubject.RESTAURANT, types);
    const phoneVerified = PHONE_OK.test(user?.phone?.trim() ?? '');
    const partnerKind: KycPartnerKind = 'RESTAURANT';
    return {
      subject: 'RESTAURANT' as const,
      userId: ownerUserId,
      restaurantId: restaurant.id,
      name: restaurant.name,
      displayName: restaurant.name,
      partnerKind,
      partnerKindLabel: kycPartnerKindLabel(partnerKind),
      kycStatus: restaurant.kycStatus,
      kycNotes: restaurant.kycNotes,
      nif: restaurant.nif,
      rccm: restaurant.rccm,
      payoutProvider: restaurant.payoutProvider,
      payoutPhone: restaurant.payoutPhone,
      address: restaurant.address,
      phone: user?.phone ?? null,
      email: user?.email ?? null,
      phoneVerified,
      canOperate: restaurant.kycStatus === PartnerKycStatus.APPROVED,
      checklist,
      requiredComplete: this.requiredComplete(checklist) && phoneVerified,
    };
  }

  async getRentalDossier(ownerUserId: string) {
    const profile = await this.ensureRentalProfile(ownerUserId);
    const user = await fetchAuthUserBrief(ownerUserId);
    const kind = profile.partnerType as RentalPartnerKind;
    const types = rentalKycTypes(kind);
    const checklist = await this.buildChecklist(ownerUserId, PartnerKycSubject.RENTAL_PARTNER, types);
    const phoneVerified = PHONE_OK.test(user?.phone?.trim() ?? '');
    const partnerKind = rentalKycPartnerKind(kind);
    const displayName = user?.name || null;
    return {
      subject: 'RENTAL_PARTNER' as const,
      userId: ownerUserId,
      partnerType: profile.partnerType,
      partnerKind,
      partnerKindLabel: kycPartnerKindLabel(partnerKind),
      displayName,
      kycStatus: profile.kycStatus,
      kycNotes: profile.kycNotes,
      nif: profile.nif,
      rccm: profile.rccm,
      phone: user?.phone ?? null,
      email: user?.email ?? null,
      phoneVerified,
      canOperate: profile.kycStatus === PartnerKycStatus.APPROVED,
      checklist,
      requiredComplete: this.requiredComplete(checklist) && phoneVerified,
    };
  }

  async updateRestaurantProfile(
    ownerUserId: string,
    data: { nif?: string; rccm?: string; payoutProvider?: string; payoutPhone?: string },
  ) {
    const restaurant = await this.ensureRestaurant(ownerUserId);
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        ...(data.nif !== undefined ? { nif: data.nif.trim() || null } : {}),
        ...(data.rccm !== undefined ? { rccm: data.rccm.trim() || null } : {}),
        ...(data.payoutProvider !== undefined ? { payoutProvider: data.payoutProvider.trim() || null } : {}),
        ...(data.payoutPhone !== undefined ? { payoutPhone: data.payoutPhone.trim() || null } : {}),
        ...(restaurant.kycStatus === PartnerKycStatus.APPROVED
          ? {}
          : { kycStatus: PartnerKycStatus.PENDING, kycNotes: null }),
      },
    });
    return this.getRestaurantDossier(ownerUserId).then((d) => ({ ...d, nif: updated.nif, rccm: updated.rccm }));
  }

  async updateRentalProfile(
    ownerUserId: string,
    data: { partnerType?: RentalPartnerKind; nif?: string; rccm?: string },
  ) {
    await this.ensureRentalProfile(ownerUserId);
    await this.prisma.rentalPartnerProfile.update({
      where: { userId: ownerUserId },
      data: {
        ...(data.partnerType ? { partnerType: data.partnerType as RentalPartnerType } : {}),
        ...(data.nif !== undefined ? { nif: data.nif.trim() || null } : {}),
        ...(data.rccm !== undefined ? { rccm: data.rccm.trim() || null } : {}),
        kycStatus: PartnerKycStatus.PENDING,
        kycNotes: null,
      },
    });
    return this.getRentalDossier(ownerUserId);
  }

  async uploadDocument(
    ownerUserId: string,
    subject: PartnerSubject,
    type: string,
    imageBase64: string,
    mimeType?: string,
  ) {
    const docType = normalizePartnerKycDocumentType(type);
    if (subject === 'RESTAURANT') await this.ensureRestaurant(ownerUserId);
    else await this.ensureRentalProfile(ownerUserId);
    const uploaded = await this.uploads.uploadKycDocument(imageBase64, mimeType);
    await this.prisma.partnerKycDocument.create({
      data: {
        userId: ownerUserId,
        subject: subject as PartnerKycSubject,
        type: docType,
        url: uploaded.photoUrl,
        status: PartnerKycStatus.PENDING,
        notes: null,
      },
    });
    if (subject === 'RESTAURANT') {
      await this.prisma.restaurant.updateMany({
        where: { ownerUserId },
        data: { kycStatus: PartnerKycStatus.PENDING, kycNotes: null },
      });
      return this.getRestaurantDossier(ownerUserId);
    }
    await this.prisma.rentalPartnerProfile.update({
      where: { userId: ownerUserId },
      data: { kycStatus: PartnerKycStatus.PENDING, kycNotes: null },
    });
    return this.getRentalDossier(ownerUserId);
  }

  async reviewDocument(documentId: string, approved: boolean, notes?: string) {
    const reason = this.rejectNotes(approved, notes);
    const doc = await this.prisma.partnerKycDocument.findUnique({ where: { id: documentId } });
    if (!doc) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Document introuvable.');
    }
    const updated = await this.prisma.partnerKycDocument.update({
      where: { id: documentId },
      data: {
        status: approved ? PartnerKycStatus.APPROVED : PartnerKycStatus.REJECTED,
        notes: reason ?? null,
      },
    });
    if (!approved) {
      await this.markSubjectPending(doc.userId, doc.subject);
    }
    return {
      id: updated.id,
      userId: updated.userId,
      subject: updated.subject,
      type: updated.type,
      status: updated.status,
      notes: updated.notes,
      url: updated.url,
    };
  }

  async reviewSubject(
    userId: string,
    subject: PartnerSubject,
    approved: boolean,
    notes?: string,
  ): Promise<Record<string, unknown> & IssueLoginPinResult> {
    const reason = this.rejectNotes(approved, notes);
    if (subject === 'RESTAURANT') {
      const restaurant = await this.prisma.restaurant.findFirst({
        where: { ownerUserId: userId },
        orderBy: { createdAt: 'asc' },
      });
      if (!restaurant) {
        throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      if (approved) {
        const dossier = await this.getRestaurantDossier(userId);
        if (!dossier.requiredComplete) {
          throw new MovaHttpException(
            MovaErrorCode.VALIDATION_ERROR,
            undefined,
            'Dossier incomplet : documents ou téléphone +243 manquants.',
          );
        }
        await this.prisma.partnerKycDocument.updateMany({
          where: { userId, subject: PartnerKycSubject.RESTAURANT, status: PartnerKycStatus.PENDING },
          data: { status: PartnerKycStatus.APPROVED, notes: null },
        });
        await this.prisma.restaurant.update({
          where: { id: restaurant.id },
          data: { kycStatus: PartnerKycStatus.APPROVED, kycNotes: null, isActive: true },
        });
        const pin = await this.issueLoginPin(userId);
        return { ...dossier, kycStatus: PartnerKycStatus.APPROVED, canOperate: true, ...pin };
      }
      await this.prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          kycStatus: PartnerKycStatus.REJECTED,
          kycNotes: reason ?? null,
          isAcceptingOrders: false,
        },
      });
      return { ...(await this.getRestaurantDossier(userId)), kycStatus: PartnerKycStatus.REJECTED };
    }

    const profile = await this.ensureRentalProfile(userId);
    if (approved) {
      const dossier = await this.getRentalDossier(userId);
      if (!dossier.requiredComplete) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          'Dossier incomplet : documents ou téléphone +243 manquants.',
        );
      }
      await this.prisma.partnerKycDocument.updateMany({
        where: { userId, subject: PartnerKycSubject.RENTAL_PARTNER, status: PartnerKycStatus.PENDING },
        data: { status: PartnerKycStatus.APPROVED, notes: null },
      });
      await this.prisma.rentalPartnerProfile.update({
        where: { userId },
        data: { kycStatus: PartnerKycStatus.APPROVED, kycNotes: null },
      });
      const pin = await this.issueLoginPin(userId);
      return { ...dossier, kycStatus: PartnerKycStatus.APPROVED, canOperate: true, ...pin };
    }
    await this.prisma.rentalPartnerProfile.update({
      where: { id: profile.id },
      data: { kycStatus: PartnerKycStatus.REJECTED, kycNotes: reason ?? null },
    });
    return { ...(await this.getRentalDossier(userId)), kycStatus: PartnerKycStatus.REJECTED };
  }

  async listPendingAdmin(status?: string) {
    const normalized = String(status ?? '').trim().toUpperCase();
    const all = normalized === 'ALL';
    const exact =
      normalized === 'PENDING' || normalized === 'APPROVED' || normalized === 'REJECTED'
        ? (normalized as PartnerKycStatus)
        : null;
    const dossierWhere = all
      ? {}
      : exact
        ? { kycStatus: exact }
        : { kycStatus: { in: [PartnerKycStatus.PENDING, PartnerKycStatus.REJECTED] } };
    const documentWhere = all ? {} : { status: exact ?? PartnerKycStatus.PENDING };
    const [restaurants, rentalProfiles, documents] = await Promise.all([
      this.prisma.restaurant.findMany({
        where: { ownerUserId: { not: null }, ...dossierWhere },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          kycStatus: true,
          kycNotes: true,
          address: true,
          nif: true,
          rccm: true,
          payoutProvider: true,
          payoutPhone: true,
        },
      }),
      this.prisma.rentalPartnerProfile.findMany({
        where: dossierWhere,
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.partnerKycDocument.findMany({
        where: documentWhere,
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);
    const restaurantDossiers = await Promise.all(
      restaurants
        .filter((r) => r.ownerUserId)
        .map(async (r) => ({
          ...(await this.getRestaurantDossier(r.ownerUserId!)),
          name: r.name,
          displayName: r.name,
        })),
    );
    const rentalDossiers = await Promise.all(
      rentalProfiles.map(async (p) => ({
        ...(await this.getRentalDossier(p.userId)),
        userId: p.userId,
      })),
    );
    const dossierByKey = new Map<string, (typeof restaurantDossiers)[number] | (typeof rentalDossiers)[number]>();
    for (const d of restaurantDossiers) {
      if (d.userId) dossierByKey.set(`${d.userId}:RESTAURANT`, d);
    }
    for (const d of rentalDossiers) {
      dossierByKey.set(`${d.userId}:RENTAL_PARTNER`, d);
    }
    const attributedDocuments = documents.map((doc) => {
      const dossier = dossierByKey.get(`${doc.userId}:${doc.subject}`);
      const partnerKind: KycPartnerKind =
        doc.subject === PartnerKycSubject.RESTAURANT
          ? 'RESTAURANT'
          : rentalKycPartnerKind(
              dossier && 'partnerType' in dossier ? (dossier.partnerType as string | undefined) : undefined,
            );
      const displayName =
        (dossier && 'name' in dossier ? dossier.name : undefined) ||
        (dossier && 'displayName' in dossier ? dossier.displayName : undefined) ||
        null;
      return {
        id: doc.id,
        userId: doc.userId,
        subject: doc.subject,
        type: doc.type,
        typeLabel: kycDocumentLabel(doc.type),
        status: doc.status,
        notes: doc.notes,
        url: doc.url,
        createdAt: doc.createdAt,
        partnerKind,
        partnerKindLabel: kycPartnerKindLabel(partnerKind),
        displayName,
        phone: dossier?.phone ?? null,
        email: dossier?.email ?? null,
      };
    });
    return {
      restaurants: restaurantDossiers,
      rentalPartners: rentalDossiers,
      documents: attributedDocuments,
    };
  }

  async issueLoginPin(userId: string): Promise<IssueLoginPinResult> {
    try {
      const res = await fetch(serviceUrl('auth', `/internal/users/${userId}/issue-login-pin`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ purpose: 'partner_kyc' }),
      });
      const json = (await res.json().catch(() => ({}))) as IssueLoginPinResult & { message?: string };
      if (!res.ok) {
        this.logger.warn(`Issue login PIN failed for ${userId}: ${json.message ?? res.status}`);
        return { smsSent: false, emailSent: false };
      }
      return {
        loginPin: json.loginPin,
        smsSent: json.smsSent,
        emailSent: json.emailSent,
        hasPhone: json.hasPhone,
        hasEmail: json.hasEmail,
        smsError: json.smsError,
        emailError: json.emailError,
      };
    } catch (e) {
      this.logger.warn(`Issue login PIN threw for ${userId}: ${(e as Error).message}`);
      return { smsSent: false, emailSent: false };
    }
  }

  private rejectNotes(approved: boolean, notes?: string) {
    try {
      return normalizeKycRejectNotes(approved, notes);
    } catch (e) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, (e as Error).message);
    }
  }

  private requiredComplete(checklist: Array<{ required: boolean; uploaded: boolean; status: string | null }>) {
    return checklist
      .filter((c) => c.required)
      .every((c) => c.uploaded && c.status !== PartnerKycStatus.REJECTED);
  }

  private async buildChecklist(
    userId: string,
    subject: PartnerKycSubject,
    types: Array<{ type: string; required: boolean; label: string }>,
  ) {
    const docs = await this.prisma.partnerKycDocument.findMany({
      where: { userId, subject },
      orderBy: { createdAt: 'desc' },
    });
    const latest = new Map<string, (typeof docs)[number]>();
    for (const doc of docs) {
      if (!latest.has(doc.type)) latest.set(doc.type, doc);
    }
    return types.map((t) => {
      const doc = latest.get(t.type);
      return {
        type: t.type,
        label: t.label,
        required: t.required,
        uploaded: !!doc,
        status: doc?.status ?? null,
        notes: doc?.notes ?? null,
        url: doc?.url ?? null,
        documentId: doc?.id ?? null,
      };
    });
  }

  private async markSubjectPending(userId: string, subject: PartnerKycSubject) {
    if (subject === PartnerKycSubject.RESTAURANT) {
      await this.prisma.restaurant.updateMany({
        where: { ownerUserId: userId },
        data: { kycStatus: PartnerKycStatus.PENDING, isAcceptingOrders: false },
      });
      return;
    }
    await this.prisma.rentalPartnerProfile.updateMany({
      where: { userId },
      data: { kycStatus: PartnerKycStatus.PENDING },
    });
  }

  private async ensureRestaurant(ownerUserId: string) {
    const existing = await this.prisma.restaurant.findFirst({
      where: { ownerUserId },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    throw new MovaHttpException(MovaErrorCode.RESTAURANT_NOT_FOUND, HttpStatus.NOT_FOUND);
  }

  async ensureRentalProfile(userId: string) {
    const existing = await this.prisma.rentalPartnerProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    try {
      return await this.prisma.rentalPartnerProfile.create({
        data: { userId, partnerType: RentalPartnerType.INDIVIDUAL, kycStatus: PartnerKycStatus.PENDING },
      });
    } catch {
      const raced = await this.prisma.rentalPartnerProfile.findUnique({ where: { userId } });
      if (raced) return raced;
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Impossible de créer le dossier loueur.');
    }
  }
}
