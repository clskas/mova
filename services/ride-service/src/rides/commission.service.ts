import { Injectable, OnModuleInit } from '@nestjs/common';
import { setRentalPlatformPercent } from '../billing/partner-display.util';
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
  [CommissionServiceType.FOOD]: {
    platformPercent: 12,
    description: 'Markup catalogue repas — ajouté au prix partenaire (client paie)',
  },
};

/** The rate is read on every list a driver opens: keep it 1 min in memory. */
const CACHE_MS = 60_000;
let cacheVersion = 0;
/** Called when the admin changes a rate, so the new rate applies at once. */
export function invalidateCommissionCache() {
  cacheVersion += 1;
}

@Injectable()
export class CommissionService implements OnModuleInit {
  private cache = new Map<CommissionServiceType, { rule: CommissionRule; at: number; version: number }>();

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    void this.get(CommissionServiceType.RENTAL).catch(() => undefined);
  }

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
    const rule = await this.read(type);
    if (type === CommissionServiceType.RENTAL) setRentalPlatformPercent(rule.platformPercent);
    return rule;
  }

  private async read(type: CommissionServiceType): Promise<CommissionRule> {
    const hit = this.cache.get(type);
    if (hit && hit.version === cacheVersion && Date.now() - hit.at < CACHE_MS) return hit.rule;
    const version = cacheVersion;
    const rule = await this.readFromDb(type);
    this.cache.set(type, { rule, at: Date.now(), version });
    return rule;
  }

  private async readFromDb(type: CommissionServiceType): Promise<CommissionRule> {
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
    // A mistyped admin rate (e.g. 120 %) must never produce a negative driver payout.
    platformPercent = Math.min(100, Math.max(0, Number.isFinite(platformPercent) ? platformPercent : 0));
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
