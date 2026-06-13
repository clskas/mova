import { HttpStatus, Injectable } from '@nestjs/common';
import { RentalInquiryStatus } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, formatCdf } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRentalBookingDto, CreateRentalInquiryDto, RentalEstimateDto } from './rental.dto';

@Injectable()
export class RentalService {
  constructor(private prisma: PrismaService) {}

  private validateDates(startDate: Date, endDate: Date) {
    if (endDate <= startDate) throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR);
  }

  private rentalDays(startDate: Date, endDate: Date): number {
    return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)));
  }

  async listVehicles() {
    const rows = await this.prisma.rentalVehicle.findMany({
      where: { isActive: true },
      orderBy: { dailyRateCdf: 'asc' },
    });
    return { data: rows, currency: 'CDF', city: 'Kinshasa' };
  }

  async estimate(dto: RentalEstimateDto) {
    const vehicle = await this.prisma.rentalVehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle || !vehicle.isActive) throw new MovaHttpException(MovaErrorCode.RENTAL_VEHICLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDates(startDate, endDate);
    const days = this.rentalDays(startDate, endDate);
    const rentalFeeCdf = vehicle.dailyRateCdf * days;
    const estimatedPriceCdf = rentalFeeCdf + vehicle.depositCdf;
    return {
      vehicle: { id: vehicle.id, name: vehicle.name, category: vehicle.category, seats: vehicle.seats },
      days,
      rentalFeeCdf,
      depositCdf: vehicle.depositCdf,
      estimatedPriceCdf,
      formatted: formatCdf(estimatedPriceCdf),
      currency: 'CDF',
    };
  }

  async createBooking(userId: string, dto: CreateRentalBookingDto) {
    const estimate = await this.estimate(dto);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const inquiry = await this.prisma.rentalInquiry.create({
      data: {
        userId,
        status: RentalInquiryStatus.CONFIRMED,
        vehicleId: dto.vehicleId,
        vehicleType: estimate.vehicle.category,
        startDate,
        endDate,
        pickupAddress: dto.pickupAddress,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
      },
      include: { vehicle: true },
    });
    return {
      booking: inquiry,
      estimate,
      message: 'Réservation enregistrée. Un conseiller MOVA vous contactera pour la remise du véhicule.',
    };
  }

  async create(userId: string, dto: CreateRentalInquiryDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.validateDates(startDate, endDate);
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
      include: { vehicle: true },
    });
  }

  async get(id: string, userId: string) {
    const inquiry = await this.prisma.rentalInquiry.findUnique({ where: { id }, include: { vehicle: true } });
    if (!inquiry) throw new MovaHttpException(MovaErrorCode.RENTAL_INQUIRY_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (inquiry.userId !== userId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return inquiry;
  }
}
