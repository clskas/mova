import { HttpStatus, Injectable } from '@nestjs/common';
import { RentalInquiryStatus, RentalVehicleApprovalStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
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
  ) {}

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

  async listVehicles(ownerUserId: string) {
    const rows = await this.prisma.rentalVehicle.findMany({
      where: { ownerUserId },
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map((r) => this.rental.mapVehicleForAdmin(r));
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
    if (existing.approvalStatus === RentalVehicleApprovalStatus.APPROVED) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        'Véhicule déjà publié — contactez MOVA pour modifier.',
      );
    }
    return this.rental.updateVehicleForOwner(ownerUserId, id, dto);
  }

  async uploadVehiclePhoto(ownerUserId: string, imageBase64: string, mimeType?: string) {
    return this.uploads.uploadVehiclePhoto(imageBase64, mimeType);
  }

  listBookings(ownerUserId: string) {
    return this.rental.ownerListBookings(ownerUserId);
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
}
