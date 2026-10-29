import { HttpStatus, Injectable } from '@nestjs/common';
import { PartnerKycStatus, RentalDepositStatus, RentalInquiryStatus, RentalLogisticsMode, RentalVehicleApprovalStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, INTERNAL_API_KEY, MOVA_EVENTS, serviceUrl } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import {
  fetchPartnerWallet,
  fetchPartnerCashVirtual,
  filterPartnerTransactions,
  startOfDay,
  startOfMonth,
  sumTransactionAmounts,
} from '../common/partner-wallet.util';
import { resolvePartnerPeriod } from '../common/partner-period.util';
import { PartnerBillingService } from '../billing/partner-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { RentalService } from '../rental/rental.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreatePartnerVehicleDto, PartnerLogisticsDto, UpdateRentalBusinessDto } from './rental-partner-portal.dto';
import { PartnerKycService } from '../partner-kyc/partner-kyc.service';
import {
  assertRentalProfileComplete,
  rentalNeedsProfileSetup,
} from './rental-profile.util';

@Injectable()
export class RentalPartnerPortalService {
  constructor(
    private prisma: PrismaService,
    private rental: RentalService,
    private uploads: UploadsService,
    private partnerBilling: PartnerBillingService,
    private partnerKyc: PartnerKycService,
    private redis: RedisService,
  ) {}

  async getDashboard(ownerUserId: string) {
    const profile = await this.getProfile(ownerUserId);
    const wallet = await fetchPartnerWallet(ownerUserId);
    const monthStart = startOfMonth();
    const todayStart = startOfDay();
    const rentalCredits = filterPartnerTransactions(wallet.transactions, 'Revenu location');
    const revenueMonthCdf = sumTransactionAmounts(
      filterPartnerTransactions(wallet.transactions, 'Revenu location', { from: monthStart }),
    );
    const revenueTodayCdf = sumTransactionAmounts(
      filterPartnerTransactions(wallet.transactions, 'Revenu location', { from: todayStart }),
    );
    const activeBookings = await this.prisma.rentalInquiry.count({
      where: {
        vehicle: { ownerUserId },
        status: { in: [RentalInquiryStatus.CONFIRMED, RentalInquiryStatus.IN_PROGRESS] },
      },
    });
    const completedMonth = await this.prisma.rentalInquiry.count({
      where: {
        vehicle: { ownerUserId },
        status: { in: [RentalInquiryStatus.RETURNED, RentalInquiryStatus.CLOSED, RentalInquiryStatus.PAID] },
        createdAt: { gte: monthStart },
      },
    });
    const recentBookings = await this.listBookings(ownerUserId, { take: 5 });
    return {
      ...profile,
      partnerName: profile.name ?? 'Partenaire location',
      kpis: {
        balanceCdf: wallet.balanceCdf,
        formattedBalance: wallet.formattedBalance,
        walletAvailable: wallet.available,
        walletMessage: wallet.unavailableReason,
        revenueTodayCdf,
        revenueMonthCdf,
        activeBookings,
        completedMonth,
        completedMonthCount: completedMonth,
        totalRentalSales: rentalCredits.length,
        pendingBookings: profile.pendingBookings,
        vehicleCounts: profile.vehicleCounts,
      },
      recentBookings: recentBookings.data,
    };
  }

  async getEarnings(ownerUserId: string) {
    const user = await fetchAuthUserBrief(ownerUserId);
    const [wallet, cashVirtual] = await Promise.all([
      fetchPartnerWallet(ownerUserId),
      fetchPartnerCashVirtual(ownerUserId),
    ]);
    const rentalCredits = filterPartnerTransactions(wallet.transactions, 'Revenu location');
    return {
      partnerName: user?.name ?? 'Partenaire',
      balanceCdf: wallet.balanceCdf,
      formattedBalance: wallet.formattedBalance,
      walletAvailable: wallet.available,
      walletMessage: wallet.unavailableReason,
      withdrawableCdf: cashVirtual.withdrawableCdf ?? wallet.balanceCdf,
      cashEarningsCdf: cashVirtual.cashEarningsCdf,
      recentRentalSales: rentalCredits.slice(0, 20).map((tx) => ({
        id: tx.id,
        amountCdf: tx.amountCdf,
        description: tx.description,
        reference: tx.reference,
        createdAt: tx.createdAt,
      })),
    };
  }

  async getEarningsReport(
    ownerUserId: string,
    query?: { from?: string; to?: string; q?: string; skip?: number; take?: number },
  ) {
    const user = await fetchAuthUserBrief(ownerUserId);
    const name = user?.name ?? 'Partenaire location';
    return this.partnerBilling.getPartnerEarningsReport(ownerUserId, 'rental', name, query);
  }

  async getEarningsReportCsv(ownerUserId: string, query?: { from?: string; to?: string; q?: string }) {
    const user = await fetchAuthUserBrief(ownerUserId);
    const name = user?.name ?? 'Partenaire location';
    const report = await this.partnerBilling.getPartnerEarningsReport(ownerUserId, 'rental', name, {
      ...query,
      take: 500,
    });
    return this.partnerBilling.buildPartnerStatementCsv('rental', name, report);
  }

  async getEarningsReportPdf(ownerUserId: string, query?: { from?: string; to?: string; q?: string }) {
    const user = await fetchAuthUserBrief(ownerUserId);
    const name = user?.name ?? 'Partenaire location';
    const { buffer, filename } = await this.partnerBilling.getPartnerStatementPdf(
      ownerUserId,
      'rental',
      name,
      query,
    );
    return { buffer, filename };
  }

  async getProfile(ownerUserId: string) {
    const user = await fetchAuthUserBrief(ownerUserId);
    const partner = await this.partnerKyc.ensureRentalProfile(ownerUserId, user?.name ?? undefined);
    const counts = await this.prisma.rentalVehicle.groupBy({
      by: ['approvalStatus'],
      where: { ownerUserId },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(counts.map((c) => [c.approvalStatus, c._count._all]));
    const pendingBookings = await this.prisma.rentalInquiry.count({
      where: {
        status: RentalInquiryStatus.PENDING,
        vehicle: { ownerUserId },
      },
    });
    const needsSetup = rentalNeedsProfileSetup(partner);
    const dossier = await this.partnerKyc.getRentalDossier(ownerUserId);
    return {
      userId: ownerUserId,
      id: partner.id,
      name: needsSetup ? user?.name : partner.businessName,
      businessName: partner.businessName,
      city: partner.city,
      address: partner.address,
      lat: partner.lat,
      lng: partner.lng,
      phone: user?.phone,
      kycStatus: partner.kycStatus,
      partnerType: partner.partnerType,
      canOperate: dossier.canOperate,
      documentsRequiredForJobs: dossier.documentsRequiredForJobs,
      documentsJobsGateOk: dossier.documentsJobsGateOk,
      documentsReminder: dossier.documentsReminder,
      needsProfileSetup: needsSetup,
      vehicleCounts: {
        pending: byStatus[RentalVehicleApprovalStatus.PENDING] ?? 0,
        approved: byStatus[RentalVehicleApprovalStatus.APPROVED] ?? 0,
        rejected: byStatus[RentalVehicleApprovalStatus.REJECTED] ?? 0,
      },
      pendingBookings,
    };
  }

  async updateBusiness(ownerUserId: string, dto: UpdateRentalBusinessDto) {
    const partner = await this.partnerKyc.ensureRentalProfile(ownerUserId);
    let payload: {
      businessName?: string;
      city?: string;
      address?: string;
      lat?: number;
      lng?: number;
    };

    if (dto.completeSetup) {
      try {
        payload = assertRentalProfileComplete({
          businessName: dto.businessName ?? partner.businessName,
          city: dto.city ?? partner.city,
          address: dto.address ?? partner.address,
          lat: dto.lat ?? partner.lat,
          lng: dto.lng ?? partner.lng,
        });
      } catch (err) {
        throw new MovaHttpException(
          MovaErrorCode.VALIDATION_ERROR,
          undefined,
          err instanceof Error ? err.message : 'Informations de location incomplètes.',
        );
      }
    } else {
      if (dto.lat != null && (dto.lat < -90 || dto.lat > 90)) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Latitude invalide.');
      }
      if (dto.lng != null && (dto.lng < -180 || dto.lng > 180)) {
        throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Longitude invalide.');
      }
      payload = {
        ...(dto.businessName !== undefined
          ? { businessName: dto.businessName.trim() || partner.businessName }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() || partner.city } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || partner.address } : {}),
        ...(dto.lat != null ? { lat: dto.lat } : {}),
        ...(dto.lng != null ? { lng: dto.lng } : {}),
      };
    }

    const updated = await this.prisma.rentalPartnerProfile.update({
      where: { id: partner.id },
      data: payload,
    });
    return {
      id: updated.id,
      businessName: updated.businessName,
      name: updated.businessName,
      city: updated.city,
      address: updated.address,
      lat: updated.lat,
      lng: updated.lng,
      needsProfileSetup: rentalNeedsProfileSetup(updated),
    };
  }

  async listVehicles(ownerUserId: string, query?: { q?: string; status?: string; city?: string }) {
    const q = query?.q?.trim().toLowerCase();
    const city = query?.city?.trim();
    const status = query?.status?.trim().toUpperCase();
    const rows = await this.prisma.rentalVehicle.findMany({
      where: {
        ownerUserId,
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(status && Object.values(RentalVehicleApprovalStatus).includes(status as RentalVehicleApprovalStatus)
          ? { approvalStatus: status as RentalVehicleApprovalStatus }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    const filtered = q
      ? rows.filter((r) => {
          const hay = `${r.name} ${r.make ?? ''} ${r.model ?? ''} ${r.city ?? ''} ${r.category}`.toLowerCase();
          return hay.includes(q);
        })
      : rows;
    return filtered.map((r) => this.rental.mapVehicleForAdmin(r));
  }

  async createVehicle(ownerUserId: string, dto: CreatePartnerVehicleDto) {
    const user = await fetchAuthUserBrief(ownerUserId);
    const created = await this.rental.createVehicleForOwner(ownerUserId, {
      ...dto,
      ownerName: dto.ownerName ?? user?.name,
      ownerContactPhone: dto.ownerContactPhone ?? user?.phone,
    });
    return created;
  }

  async updateVehicle(ownerUserId: string, id: string, dto: Partial<CreatePartnerVehicleDto>) {
    const existing = await this.prisma.rentalVehicle.findFirst({ where: { id, ownerUserId } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return this.rental.updateVehicleForOwner(ownerUserId, id, dto);
  }

  async uploadVehiclePhoto(ownerUserId: string, imageBase64: string, mimeType?: string) {
    return this.uploads.uploadVehiclePhoto(imageBase64, mimeType);
  }

  getVehicle(ownerUserId: string, id: string) {
    return this.getVehicleForOwner(ownerUserId, id);
  }

  async getVehicleForOwner(ownerUserId: string, id: string) {
    return this.rental.getVehicleForOwner(ownerUserId, id);
  }

  async deleteVehicle(ownerUserId: string, id: string) {
    return this.rental.deleteVehicleForOwner(ownerUserId, id);
  }

  listBookings(
    ownerUserId: string,
    query?: { status?: string; vehicleId?: string; from?: string; to?: string; q?: string; skip?: number; take?: number },
  ) {
    return this.rental.ownerListBookings(ownerUserId, query);
  }

  getBooking(ownerUserId: string, id: string) {
    return this.rental.ownerGetBooking(ownerUserId, id);
  }

  updateBookingStatus(ownerUserId: string, id: string, action: 'acknowledge' | 'confirm' | 'decline' | 'start' | 'return') {
    return this.rental.ownerUpdateBookingStatus(ownerUserId, id, action);
  }

  updateLogistics(ownerUserId: string, id: string, dto: PartnerLogisticsDto) {
    return this.rental.ownerUpdateLogistics(ownerUserId, id, dto);
  }

  async confirmCashPayment(ownerUserId: string, bookingId: string) {
    const booking = await this.rental.ownerGetBooking(ownerUserId, bookingId);
    if (booking.status !== RentalInquiryStatus.RETURNED) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Le paiement espèces est disponible après le retour du véhicule.',
      );
    }
    const res = await fetch(
      serviceUrl('payment', `/internal/services/RENTAL/${bookingId}/cash/confirm-partner`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': INTERNAL_API_KEY,
        },
        body: JSON.stringify({ ownerUserId }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
    if (!res.ok) {
      const msg = data?.error?.message ?? data?.message ?? 'Confirmation impossible.';
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, res.status as HttpStatus, msg);
    }
    return this.rental.ownerGetBooking(ownerUserId, bookingId);
  }

  async getAnalytics(ownerUserId: string, query?: { days?: number; from?: string; to?: string }) {
    const period = resolvePartnerPeriod(query);
    const bookings = await this.prisma.rentalInquiry.findMany({
      where: {
        vehicle: { ownerUserId },
        createdAt: { gte: period.from, lte: period.to },
      },
      include: { vehicle: { select: { id: true, name: true } } },
    });
    let confirmed = 0;
    let declined = 0;
    let completed = 0;
    let revenueCdf = 0;
    let confirmLatencySumH = 0;
    let confirmLatencyN = 0;
    const byVehicle = new Map<string, { name: string; bookings: number; revenueCdf: number }>();
    for (const b of bookings) {
      const st = b.status;
      if (st === RentalInquiryStatus.CONFIRMED || st === RentalInquiryStatus.IN_PROGRESS || st === RentalInquiryStatus.RETURNED || st === RentalInquiryStatus.PAID || st === RentalInquiryStatus.CLOSED) {
        confirmed += 1;
        const hours = (b.updatedAt.getTime() - b.createdAt.getTime()) / 3_600_000;
        if (hours >= 0 && hours < 72) {
          confirmLatencySumH += hours;
          confirmLatencyN += 1;
        }
      }
      if (st === RentalInquiryStatus.CLOSED && !b.checkInAt) declined += 1;
      if (st === RentalInquiryStatus.RETURNED || st === RentalInquiryStatus.PAID || st === RentalInquiryStatus.CLOSED) {
        completed += 1;
        revenueCdf += b.totalCdf ?? b.estimatedPriceCdf ?? 0;
      }
      const vid = b.vehicleId ?? 'unknown';
      const name = b.vehicle?.name ?? 'Véhicule';
      const cur = byVehicle.get(vid) ?? { name, bookings: 0, revenueCdf: 0 };
      cur.bookings += 1;
      cur.revenueCdf += b.totalCdf ?? b.estimatedPriceCdf ?? 0;
      byVehicle.set(vid, cur);
    }
    const pending = bookings.filter((b) => b.status === RentalInquiryStatus.PENDING).length;
    const confirmRate =
      confirmed + declined + pending > 0
        ? Math.round((confirmed / (confirmed + declined + Math.max(pending, 0))) * 1000) / 10
        : null;
    const alerts: string[] = [];
    if (pending > 3) alerts.push(`${pending} réservations en attente`);
    if (confirmLatencyN > 0 && confirmLatencySumH / confirmLatencyN > 12) {
      alerts.push('Délai de confirmation élevé');
    }
    return {
      period: { from: period.fromYmd, to: period.toYmd, days: period.days },
      kpis: {
        bookings: bookings.length,
        pending,
        confirmed,
        declined,
        completed,
        revenueCdf,
        avgTicketCdf: completed > 0 ? Math.round(revenueCdf / completed) : 0,
        avgConfirmHours: confirmLatencyN > 0 ? Math.round((confirmLatencySumH / confirmLatencyN) * 10) / 10 : null,
        confirmRate,
      },
      topVehicles: [...byVehicle.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 8),
      alerts,
    };
  }

  async getInbox(ownerUserId: string) {
    const dossier = await this.partnerKyc.getRentalDossier(ownerUserId);
    const items: Array<{ id: string; kind: string; priority: number; title: string; href: string; meta?: string }> = [];
    if (dossier.kycStatus === PartnerKycStatus.REJECTED) {
      items.push({
        id: 'kyc-rejected',
        kind: 'KYC',
        priority: 1,
        title: 'Dossier rejeté — à corriger',
        href: '/dossier',
        meta: dossier.kycNotes ?? undefined,
      });
    } else if (!dossier.canOperate) {
      items.push({
        id: 'kyc-pending',
        kind: 'KYC',
        priority: 2,
        title: 'Dossier incomplet ou en validation',
        href: '/dossier',
      });
    }
    const pending = await this.prisma.rentalInquiry.count({
      where: { vehicle: { ownerUserId }, status: RentalInquiryStatus.PENDING },
    });
    if (pending > 0) {
      items.push({
        id: 'bookings-pending',
        kind: 'BOOKINGS',
        priority: 1,
        title: `${pending} réservation(s) en attente`,
        href: '/reservations',
      });
    }
    const needCheckIn = await this.prisma.rentalInquiry.count({
      where: {
        vehicle: { ownerUserId },
        status: { in: [RentalInquiryStatus.CONFIRMED, RentalInquiryStatus.IN_PROGRESS] },
        checkInAt: null,
        startDate: { lte: new Date() },
      },
    });
    if (needCheckIn > 0) {
      items.push({
        id: 'checkin',
        kind: 'CHECKIN',
        priority: 2,
        title: `${needCheckIn} check-in à faire`,
        href: '/reservations',
      });
    }
    const needCheckOut = await this.prisma.rentalInquiry.count({
      where: {
        vehicle: { ownerUserId },
        status: RentalInquiryStatus.IN_PROGRESS,
        checkInAt: { not: null },
        checkOutAt: null,
        endDate: { lte: new Date() },
      },
    });
    if (needCheckOut > 0) {
      items.push({
        id: 'checkout',
        kind: 'CHECKOUT',
        priority: 2,
        title: `${needCheckOut} check-out à faire`,
        href: '/reservations',
      });
    }
    const disputed = await this.prisma.rentalInquiry.count({
      where: { vehicle: { ownerUserId }, depositStatus: RentalDepositStatus.DISPUTED },
    });
    if (disputed > 0) {
      items.push({
        id: 'deposit',
        kind: 'DEPOSIT',
        priority: 2,
        title: `${disputed} caution(s) en litige`,
        href: '/reservations',
      });
    }
    items.sort((a, b) => a.priority - b.priority);
    return { counts: { total: items.length }, items };
  }

  async getCalendar(ownerUserId: string, query?: { from?: string; to?: string }) {
    const period = resolvePartnerPeriod({ days: 30, ...query });
    const vehicles = await this.prisma.rentalVehicle.findMany({
      where: { ownerUserId, isActive: true },
      select: { id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    });
    const vehicleIds = vehicles.map((v) => v.id);
    const [bookings, blocks] = await Promise.all([
      this.prisma.rentalInquiry.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          status: {
            in: [
              RentalInquiryStatus.PENDING,
              RentalInquiryStatus.CONFIRMED,
              RentalInquiryStatus.IN_PROGRESS,
              RentalInquiryStatus.RETURNED,
            ],
          },
          startDate: { lte: period.to },
          endDate: { gte: period.from },
        },
        select: {
          id: true,
          vehicleId: true,
          status: true,
          startDate: true,
          endDate: true,
          contactPhone: true,
        },
      }),
      this.prisma.vehicleBlock.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          startDate: { lte: period.to },
          endDate: { gte: period.from },
        },
      }),
    ]);
    return {
      period: { from: period.fromYmd, to: period.toYmd },
      vehicles,
      bookings,
      blocks,
    };
  }

  async createVehicleBlock(
    ownerUserId: string,
    data: { vehicleId: string; startDate: string; endDate: string; reason?: string },
  ) {
    await this.getVehicleForOwner(ownerUserId, data.vehicleId);
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Dates de blocage invalides.');
    }
    return this.prisma.vehicleBlock.create({
      data: {
        vehicleId: data.vehicleId,
        startDate: start,
        endDate: end,
        reason: data.reason?.trim() || null,
      },
    });
  }

  async deleteVehicleBlock(ownerUserId: string, blockId: string) {
    const block = await this.prisma.vehicleBlock.findFirst({
      where: { id: blockId, vehicle: { ownerUserId } },
    });
    if (!block) throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Blocage introuvable.');
    await this.prisma.vehicleBlock.delete({ where: { id: blockId } });
    return { success: true };
  }

  async checkInBooking(
    ownerUserId: string,
    bookingId: string,
    data: { km?: number; photos?: string[]; signature?: string; holdDeposit?: boolean },
  ) {
    const booking = await this.rental.ownerGetBooking(ownerUserId, bookingId);
    if ((booking as { checkInAt?: Date | null }).checkInAt) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Check-in déjà effectué.');
    }
    const vehicleDep =
      (booking as { vehicle?: { depositCdf?: number }; depositCdf?: number }).vehicle?.depositCdf ??
      (booking as { depositCdf?: number }).depositCdf ??
      null;
    const depositCdf = vehicleDep;
    const updated = await this.prisma.rentalInquiry.update({
      where: { id: bookingId },
      data: {
        checkInAt: new Date(),
        checkInKm: data.km ?? null,
        checkInPhotos: data.photos ?? [],
        checkInSignature: data.signature?.trim() || null,
        status:
          booking.status === RentalInquiryStatus.CONFIRMED ? RentalInquiryStatus.IN_PROGRESS : booking.status,
        ...(data.holdDeposit !== false && depositCdf
          ? { depositStatus: RentalDepositStatus.HELD, depositHeldCdf: depositCdf }
          : {}),
      },
      include: { vehicle: true },
    });
    return updated;
  }

  async checkOutBooking(
    ownerUserId: string,
    bookingId: string,
    data: { km?: number; photos?: string[]; signature?: string; pin?: string },
  ) {
    const row = await this.prisma.rentalInquiry.findFirst({
      where: { id: bookingId, vehicle: { ownerUserId } },
    });
    if (!row) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!row.checkInAt) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Faites le check-in d’abord.');
    }
    if (row.checkOutAt) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Check-out déjà effectué.');
    }
    if (row.completionPin && data.pin && data.pin.trim() !== row.completionPin) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'PIN de retour incorrect.');
    }
    return this.prisma.rentalInquiry.update({
      where: { id: bookingId },
      data: {
        checkOutAt: new Date(),
        checkOutKm: data.km ?? null,
        checkOutPhotos: data.photos ?? [],
        checkOutSignature: data.signature?.trim() || null,
        status: RentalInquiryStatus.RETURNED,
      },
      include: { vehicle: true },
    });
  }

  async updateDeposit(
    ownerUserId: string,
    bookingId: string,
    data: { status: RentalDepositStatus; note?: string; heldCdf?: number },
  ) {
    await this.rental.ownerGetBooking(ownerUserId, bookingId);
    return this.prisma.rentalInquiry.update({
      where: { id: bookingId },
      data: {
        depositStatus: data.status,
        ...(data.note !== undefined ? { depositNote: data.note.trim() || null } : {}),
        ...(data.heldCdf !== undefined ? { depositHeldCdf: data.heldCdf } : {}),
      },
    });
  }

  async requestMovaDriver(ownerUserId: string, bookingId: string) {
    const row = await this.prisma.rentalInquiry.findFirst({
      where: { id: bookingId, vehicle: { ownerUserId } },
    });
    if (!row) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updated = await this.prisma.rentalInquiry.update({
      where: { id: bookingId },
      data: {
        logisticsMode: RentalLogisticsMode.MOVA_DRIVER,
        movaDriverRequestedAt: new Date(),
      },
      include: { vehicle: true },
    });
    await this.redis
      .publish(MOVA_EVENTS.SERVICE_ASSIGNED, {
        serviceType: 'RENTAL',
        referenceId: bookingId,
        passengerId: row.userId,
        summary: 'Demande chauffeur MOVA (partenaire location)',
        needsMovaDriver: true,
        ownerUserId,
      })
      .catch(() => undefined);
    return updated;
  }

  async getQualitySla(ownerUserId: string, query?: { days?: number; from?: string; to?: string }) {
    const analytics = await this.getAnalytics(ownerUserId, query);
    const noShows = await this.prisma.rentalInquiry.count({
      where: {
        vehicle: { ownerUserId },
        status: RentalInquiryStatus.CLOSED,
        checkInAt: null,
        createdAt: {
          gte: resolvePartnerPeriod(query).from,
          lte: resolvePartnerPeriod(query).to,
        },
      },
    });
    return {
      ...analytics,
      sla: {
        avgConfirmHours: analytics.kpis.avgConfirmHours,
        confirmRate: analytics.kpis.confirmRate,
        pending: analytics.kpis.pending,
        noShows,
        alert:
          (analytics.kpis.avgConfirmHours != null && analytics.kpis.avgConfirmHours > 12) ||
          (analytics.kpis.confirmRate != null && analytics.kpis.confirmRate < 70) ||
          analytics.kpis.pending > 5,
      },
    };
  }
}
