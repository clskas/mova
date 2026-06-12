import { HttpStatus, Injectable } from '@nestjs/common';
import { RentalInquiryStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRentalInquiryDto } from './rental.dto';

@Injectable()
export class RentalService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateRentalInquiryDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
    const inquiry = await this.prisma.rentalInquiry.create({
      data: {
        userId,
        status: RentalInquiryStatus.PENDING,
        vehicleType: dto.vehicleType,
        startDate,
        endDate,
        pickupAddress: dto.pickupAddress,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
      },
    });
    return {
      inquiry,
      message: 'Demande enregistrée. Un conseiller MOVA vous contactera sous 24h.',
    };
  }

  async list(userId: string) {
    return this.prisma.rentalInquiry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async get(id: string, userId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return inquiry;
  }
}
