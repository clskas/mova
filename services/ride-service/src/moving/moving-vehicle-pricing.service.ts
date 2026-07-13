import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MovingVehicleCategory } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export const MOVING_VEHICLE_CATEGORY_DEFAULTS: Array<{
  category: MovingVehicleCategory;
  label: string;
  multiplier: number;
  sortOrder: number;
}> = [
  { category: MovingVehicleCategory.CAMIONNETTE, label: 'Camionnette / pick-up', multiplier: 0.85, sortOrder: 1 },
  { category: MovingVehicleCategory.CAMION_15M3, label: 'Camion ~15 m³', multiplier: 1, sortOrder: 2 },
  { category: MovingVehicleCategory.CAMION_30M3, label: 'Camion ~30 m³', multiplier: 1.45, sortOrder: 3 },
  { category: MovingVehicleCategory.CAMION_50M3, label: 'Gros camion ~50 m³', multiplier: 1.9, sortOrder: 4 },
];

@Injectable()
export class MovingVehiclePricingService implements OnModuleInit {
  private readonly logger = new Logger(MovingVehiclePricingService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaults().catch((err: unknown) => {
      this.logger.warn(`Moving vehicle pricing seed skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  async ensureDefaults() {
    for (const row of MOVING_VEHICLE_CATEGORY_DEFAULTS) {
      await this.prisma.movingVehicleCategoryPricing.upsert({
        where: { category: row.category },
        create: row,
        update: {},
      });
    }
  }

  async listAll() {
    const rows = await this.prisma.movingVehicleCategoryPricing.findMany({
      orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }],
    });
    if (rows.length > 0) return rows;
    return MOVING_VEHICLE_CATEGORY_DEFAULTS.map((row) => ({
      id: row.category,
      ...row,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  async getMultiplier(category: MovingVehicleCategory): Promise<number> {
    const row = await this.prisma.movingVehicleCategoryPricing.findUnique({ where: { category } });
    if (row?.isActive) return row.multiplier;
    const fallback = MOVING_VEHICLE_CATEGORY_DEFAULTS.find((r) => r.category === category);
    return fallback?.multiplier ?? 1;
  }

  async getLabel(category: MovingVehicleCategory): Promise<string> {
    const row = await this.prisma.movingVehicleCategoryPricing.findUnique({ where: { category } });
    if (row?.label) return row.label;
    const fallback = MOVING_VEHICLE_CATEGORY_DEFAULTS.find((r) => r.category === category);
    return fallback?.label ?? category;
  }

  async update(
    category: MovingVehicleCategory,
    data: Partial<{ label: string; multiplier: number; sortOrder: number; isActive: boolean }>,
  ) {
    await this.ensureDefaults();
    const existing = await this.prisma.movingVehicleCategoryPricing.findUnique({ where: { category } });
    if (!existing) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Catégorie engin introuvable.');
    }
    if (data.multiplier != null && (data.multiplier < 0.1 || data.multiplier > 10)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Le coefficient doit être entre 0,1 et 10.',
      );
    }
    const patch: Partial<{ label: string; multiplier: number; sortOrder: number; isActive: boolean }> = {};
    if (typeof data.label === 'string' && data.label.trim()) patch.label = data.label.trim();
    if (typeof data.multiplier === 'number') patch.multiplier = data.multiplier;
    if (typeof data.sortOrder === 'number') patch.sortOrder = data.sortOrder;
    if (typeof data.isActive === 'boolean') patch.isActive = data.isActive;
    return this.prisma.movingVehicleCategoryPricing.update({ where: { category }, data: patch });
  }
}
