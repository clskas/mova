import { HttpStatus, Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingAdminService {
  constructor(private prisma: PrismaService) {}

  listRules() {
    return this.prisma.pricingRule.findMany({ orderBy: { vehicleType: 'asc' } });
  }

  async updateRule(vehicleType: VehicleType, data: Partial<{ baseFareCdf: number; perKmCdf: number; perMinuteCdf: number; minFareCdf: number }>) {
    const existing = await this.prisma.pricingRule.findUnique({ where: { vehicleType } });
    if (!existing) throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.NOT_FOUND);
    return this.prisma.pricingRule.update({ where: { vehicleType }, data });
  }
}
