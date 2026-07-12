import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrandCategory } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_ERRAND_CATEGORY_ESTIMATES,
  inferErrandCategoryFromPatterns,
} from './errand-category.util';

export type ErrandCategoryEstimateRow = {
  category: ErrandCategory;
  label: string;
  perItemCdf: number;
  keywordPattern: string | null;
  sortOrder: number;
  isActive: boolean;
};

@Injectable()
export class ErrandCategoryEstimateService {
  constructor(private prisma: PrismaService) {}

  listAll() {
    return this.prisma.errandCategoryEstimate.findMany({ orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }] });
  }

  listActive() {
    return this.prisma.errandCategoryEstimate.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }],
    });
  }

  async get(category: ErrandCategory) {
    const row = await this.prisma.errandCategoryEstimate.findUnique({ where: { category } });
    if (!row) {
      throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.NOT_FOUND);
    }
    return row;
  }

  async create(data: {
    category: ErrandCategory;
    label: string;
    perItemCdf: number;
    keywordPattern?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!data.label.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Libellé requis.');
    }
    if (!Number.isFinite(data.perItemCdf) || data.perItemCdf < 0) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Montant par article invalide.');
    }
    const existing = await this.prisma.errandCategoryEstimate.findUnique({ where: { category: data.category } });
    if (existing) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.CONFLICT, 'Catégorie déjà configurée.');
    }
    return this.prisma.errandCategoryEstimate.create({
      data: {
        category: data.category,
        label: data.label.trim(),
        perItemCdf: Math.round(data.perItemCdf),
        keywordPattern: data.keywordPattern?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(
    category: ErrandCategory,
    data: Partial<{
      label: string;
      perItemCdf: number;
      keywordPattern: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    await this.get(category);
    if (data.label != null && !data.label.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Libellé requis.');
    }
    if (data.perItemCdf != null && (!Number.isFinite(data.perItemCdf) || data.perItemCdf < 0)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Montant par article invalide.');
    }
    return this.prisma.errandCategoryEstimate.update({
      where: { category },
      data: {
        ...(data.label != null ? { label: data.label.trim() } : {}),
        ...(data.perItemCdf != null ? { perItemCdf: Math.round(data.perItemCdf) } : {}),
        ...(data.keywordPattern !== undefined ? { keywordPattern: data.keywordPattern?.trim() || null } : {}),
        ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
  }

  async deactivate(category: ErrandCategory) {
    return this.update(category, { isActive: false });
  }

  private fallbackRows(): ErrandCategoryEstimateRow[] {
    return DEFAULT_ERRAND_CATEGORY_ESTIMATES.map((row) => ({
      category: row.category,
      label: row.label,
      perItemCdf: row.perItemCdf,
      keywordPattern: row.keywordPattern,
      sortOrder: row.sortOrder,
      isActive: true,
    }));
  }

  private async runtimeRows(): Promise<ErrandCategoryEstimateRow[]> {
    try {
      const rows = await this.listActive();
      if (rows.length > 0) return rows;
    } catch {
      /* table may not exist yet during migration */
    }
    return this.fallbackRows();
  }

  async inferCategory(pickupAddress: string, items: string[] = []): Promise<ErrandCategory> {
    const rows = await this.runtimeRows();
    const text = `${pickupAddress} ${items.join(' ')}`;
    return inferErrandCategoryFromPatterns(text, rows);
  }

  async estimatePurchase(category: ErrandCategory, itemCount: number): Promise<number> {
    if (itemCount <= 0) return 0;
    const rows = await this.runtimeRows();
    const row = rows.find((r) => r.category === category);
    if (row) return Math.round(itemCount * row.perItemCdf);
    const cfg = MARKET_RDC.errand.categoryEstimates[category] ?? MARKET_RDC.errand.categoryEstimates.OTHER;
    return Math.round(itemCount * cfg.perItemCdf);
  }

  async categoryLabel(category: ErrandCategory): Promise<string> {
    const rows = await this.runtimeRows();
    const row = rows.find((r) => r.category === category);
    if (row) return row.label;
    return MARKET_RDC.errand.categoryEstimates[category]?.label ?? 'Autre';
  }
}
