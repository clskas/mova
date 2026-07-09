import { HttpStatus, Injectable } from '@nestjs/common';
import { RentalInquiryStatus, RentalVehicleApprovalStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import {
  fetchPartnerWallet,
  filterPartnerTransactions,
  startOfDay,
  startOfMonth,
  sumTransactionAmounts,
} from '../common/partner-wallet.util';
import { PartnerBillingService } from '../billing/partner-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { RentalService } from '../rental/rental.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreatePartnerVehicleDto, PartnerLogisticsDto } from './rental-partner-portal.dto';

@Injectable()
export class RentalPartnerPortalService {
  constructor(
    private prisma: PrismaService,
    private rental: RentalService,
    private uploads: UploadsService,
    private partnerBilling: PartnerBillingService,
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
      kpis: {
        balanceCdf: wallet.balanceCdf,
        formattedBalance: wallet.formattedBalance,
        revenueTodayCdf,
        revenueMonthCdf,
        activeBookings,
        completedMonth,
        totalRentalSales: rentalCredits.length,
      },
      recentBookings: recentBookings.data,
    };
  }

  async getEarnings(ownerUserId: string) {
    const user = await fetchAuthUserBrief(ownerUserId);
    const wallet = await fetchPartnerWallet(ownerUserId);
    const rentalCredits = filterPartnerTransactions(wallet.transactions, 'Revenu location');
    return {
      partnerName: user?.name ?? 'Partenaire',
      balanceCdf: wallet.balanceCdf,
      formattedBalance: wallet.formattedBalance,
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
    return {
      userId: ownerUserId,
      name: user?.name,
      phone: user?.phone,
      vehicleCounts: {
        pending: byStatus[RentalVehicleApprovalStatus.PENDING] ?? 0,
        approved: byStatus[RentalVehicleApprovalStatus.APPROVED] ?? 0,
        rejected: byStatus[RentalVehicleApprovalStatus.REJECTED] ?? 0,
      },
      pendingBookings,
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

  async confirmCashPayment(ownerUserId: string, bookingId: string, pin: string) {
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
        body: JSON.stringify({ ownerUserId, pin }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
    if (!res.ok) {
      const msg = data?.error?.message ?? data?.message ?? 'Confirmation impossible.';
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, res.status as HttpStatus, msg);
    }
    return this.rental.ownerGetBooking(ownerUserId, bookingId);
  }
}
