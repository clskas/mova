import { Injectable } from '@nestjs/common';
import { CommissionServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CommissionRule = {
  serviceType: CommissionServiceType;
  platformPercent: number;
  driverPercent: number;
  fixedFeeCdf: number | null;
  perItemFeeCdf: number | null;
  description: string | null;
  isActive: boolean;
};

const DEFAULTS: Record<
  CommissionServiceType,
  { platformPercent: number; fixedFeeCdf?: number; perItemFeeCdf?: number; description: string }
> = {
  [CommissionServiceType.RIDE]: { platformPercent: 15, description: 'Courses taxi / moto' },
  [CommissionServiceType.DELIVERY]: { platformPercent: 20, description: 'Livraisons' },
  [CommissionServiceType.MOVING]: { platformPercent: 18, description: 'Déménagements' },
  [CommissionServiceType.RENTAL]: { platformPercent: 12, description: 'Location véhicule' },
  [CommissionServiceType.CARPOOL]: { platformPercent: 10, description: 'Covoiturage' },
  [CommissionServiceType.ERRAND]: {
    platformPercent: 15,
    fixedFeeCdf: 2500,
    perItemFeeCdf: 1500,
    description: 'Courses & commissions',
  },
};

@Injectable()
export class CommissionService {
  constructor(private prisma: PrismaService) {}

  private fallback(type: CommissionServiceType): CommissionRule {
    const d = DEFAULTS[type];
    const platformPercent = d.platformPercent;
    return {
      serviceType: type,
      platformPercent,
      driverPercent: 100 - platformPercent,
      fixedFeeCdf: d.fixedFeeCdf ?? null,
      perItemFeeCdf: d.perItemFeeCdf ?? null,
      description: d.description,
      isActive: true,
    };
  }

  async get(type: CommissionServiceType): Promise<CommissionRule> {
    const row = await this.prisma.platformCommission.findUnique({ where: { serviceType: type } });
    if (!row || !row.isActive) return this.fallback(type);
    return {
      serviceType: row.serviceType,
      platformPercent: row.platformPercent,
      driverPercent: row.driverPercent,
      fixedFeeCdf: row.fixedFeeCdf,
      perItemFeeCdf: row.perItemFeeCdf,
      description: row.description,
      isActive: row.isActive,
    };
  }

  splitGross(grossCdf: number, platformPercent: number) {
    const platformFeeCdf = Math.ceil(grossCdf * (platformPercent / 100));
    return {
      grossCdf,
      platformFeeCdf,
      driverNetCdf: grossCdf - platformFeeCdf,
      platformPercent,
      driverPercent: 100 - platformPercent,
    };
  }

  async splitForService(grossCdf: number, type: CommissionServiceType) {
    const rule = await this.get(type);
    return this.splitGross(grossCdf, rule.platformPercent);
  }
}
