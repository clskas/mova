import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WeightCategory } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export const PARCEL_WEIGHT_BAND_DEFAULTS: Array<{
  maxKg: number;
  category: WeightCategory;
  multiplier: number;
  label: string;
  sortOrder: number;
}> = [
  { maxKg: 0.5, category: WeightCategory.DOCUMENTS, multiplier: 1.0, label: 'Documents (≤ 0,5 kg)', sortOrder: 1 },
  { maxKg: 1, category: WeightCategory.SMALL, multiplier: 1.1, label: 'Petit colis (≤ 1 kg)', sortOrder: 2 },
  { maxKg: 5, category: WeightCategory.MEDIUM, multiplier: 1.25, label: 'Moyen (≤ 5 kg)', sortOrder: 3 },
  { maxKg: 50, category: WeightCategory.LARGE, multiplier: 1.5, label: 'Grand colis (≤ 50 kg)', sortOrder: 4 },
];

@Injectable()
export class ParcelWeightBandService implements OnModuleInit {
  private readonly logger = new Logger(ParcelWeightBandService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaults().catch((err: unknown) => {
      this.logger.warn(`Parcel weight band seed skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  async ensureDefaults() {
    for (const row of PARCEL_WEIGHT_BAND_DEFAULTS) {
      await this.prisma.parcelWeightBand.upsert({
        where: { category: row.category },
        create: row,
        update: {},
      });
    }
  }

  async listAll() {
    const rows = await this.prisma.parcelWeightBand.findMany({
      orderBy: [{ sortOrder: 'asc' }, { maxKg: 'asc' }],
    });
    if (rows.length > 0) return rows;
    return PARCEL_WEIGHT_BAND_DEFAULTS.map((row) => ({
      id: row.category,
      ...row,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  async resolve(weightKg?: number | null): Promise<{ category: WeightCategory; multiplier: number }> {
    const bands = await this.listAll();
    const active = bands.filter((b) => b.isActive);
    if (weightKg != null && weightKg > 0) {
      const band = active.find((b) => weightKg <= b.maxKg);
      if (band) return { category: band.category, multiplier: band.multiplier };
      const largest = active[active.length - 1];
      if (largest) return { category: largest.category, multiplier: largest.multiplier };
    }
    return { category: WeightCategory.DOCUMENTS, multiplier: 1 };
  }

  async getMultiplier(category: WeightCategory): Promise<number> {
    const row = await this.prisma.parcelWeightBand.findUnique({ where: { category } });
    if (row?.isActive) return row.multiplier;
    const fallback = PARCEL_WEIGHT_BAND_DEFAULTS.find((r) => r.category === category);
    return fallback?.multiplier ?? 1;
  }

  async update(
    category: WeightCategory,
    data: Partial<{ label: string; maxKg: number; multiplier: number; sortOrder: number; isActive: boolean }>,
  ) {
    await this.ensureDefaults();
    const existing = await this.prisma.parcelWeightBand.findUnique({ where: { category } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Bande de poids introuvable.');
    }
    if (data.multiplier != null && (data.multiplier < 0.5 || data.multiplier > 5)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Multiplicateur entre 0,5 et 5.');
    }
    if (data.maxKg != null && data.maxKg <= 0) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Poids max invalide.');
    }
    const patch: Partial<{ label: string; maxKg: number; multiplier: number; sortOrder: number; isActive: boolean }> = {};
    if (typeof data.label === 'string' && data.label.trim()) patch.label = data.label.trim();
    if (typeof data.maxKg === 'number') patch.maxKg = data.maxKg;
    if (typeof data.multiplier === 'number') patch.multiplier = data.multiplier;
    if (typeof data.sortOrder === 'number') patch.sortOrder = data.sortOrder;
    if (typeof data.isActive === 'boolean') patch.isActive = data.isActive;
    return this.prisma.parcelWeightBand.update({ where: { category }, data: patch });
  }
}
