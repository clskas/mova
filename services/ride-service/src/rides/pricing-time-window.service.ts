import { HttpStatus, Injectable } from '@nestjs/common';
import { PricingTimeKind } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException, resolveCityTimezone } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hourInWindow, marketHourNow } from './pricing-time-window.util';

type TimeWindowRow = {
  kind: PricingTimeKind;
  startHour: number;
  endHour: number;
  isActive: boolean;
};

const DEFAULT_TIME_WINDOWS: Array<Omit<TimeWindowRow, 'isActive'> & { label: string; sortOrder: number }> = [
  { kind: PricingTimeKind.PEAK, startHour: 7, endHour: 9, label: 'Matin', sortOrder: 1 },
  { kind: PricingTimeKind.PEAK, startHour: 17, endHour: 19, label: 'Soir', sortOrder: 2 },
  { kind: PricingTimeKind.NIGHT, startHour: 22, endHour: 5, label: 'Nuit', sortOrder: 3 },
];

@Injectable()
export class PricingTimeWindowService {
  constructor(private prisma: PrismaService) {}

  listAll(city?: string) {
    return this.prisma.pricingTimeWindow.findMany({
      where: city ? { city } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { kind: 'asc' }, { startHour: 'asc' }],
    });
  }

  async listForCity(city?: string) {
    const windows = await this.listAll(city);
    const timezone = city?.trim() ? resolveCityTimezone(city.trim()) : MARKET_RDC.timezone;
    return { timezone, windows };
  }

  async get(id: string) {
    const row = await this.prisma.pricingTimeWindow.findUnique({ where: { id } });
    if (!row) {
      throw new MovaHttpException(MovaErrorCode.PRICING_NOT_CONFIGURED, HttpStatus.NOT_FOUND, 'Plage horaire introuvable.');
    }
    return row;
  }

  async create(data: {
    city: string;
    kind: PricingTimeKind;
    startHour: number;
    endHour: number;
    label?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    this.validateHours(data.startHour, data.endHour);
    if (!data.city.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Ville requise.');
    }
    return this.prisma.pricingTimeWindow.create({
      data: {
        city: data.city.trim(),
        kind: data.kind,
        startHour: data.startHour,
        endHour: data.endHour,
        label: data.label?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      kind: PricingTimeKind;
      startHour: number;
      endHour: number;
      label: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    const existing = await this.get(id);
    const startHour = data.startHour ?? existing.startHour;
    const endHour = data.endHour ?? existing.endHour;
    this.validateHours(startHour, endHour);
    return this.prisma.pricingTimeWindow.update({
      where: { id },
      data: {
        ...(data.kind != null ? { kind: data.kind } : {}),
        ...(data.startHour != null ? { startHour: data.startHour } : {}),
        ...(data.endHour != null ? { endHour: data.endHour } : {}),
        ...(data.label !== undefined ? { label: data.label?.trim() || null } : {}),
        ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive != null ? { isActive: data.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.pricingTimeWindow.delete({ where: { id } });
  }

  async evaluate(city: string, hour?: number): Promise<{ isPeak: boolean; isNight: boolean }> {
    const timezone = resolveCityTimezone(city);
    const h = hour ?? marketHourNow(timezone);
    const windows = await this.runtimeWindows(city);
    const isPeak = windows.some((w) => w.kind === PricingTimeKind.PEAK && w.isActive && hourInWindow(h, w.startHour, w.endHour));
    const isNight = windows.some((w) => w.kind === PricingTimeKind.NIGHT && w.isActive && hourInWindow(h, w.startHour, w.endHour));
    return { isPeak, isNight };
  }

  private async runtimeWindows(city: string): Promise<TimeWindowRow[]> {
    try {
      const rows = await this.prisma.pricingTimeWindow.findMany({
        where: { city, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { startHour: 'asc' }],
      });
      if (rows.length > 0) return rows;
    } catch {
      /* table may not exist yet during migration */
    }
    return this.configFallbackWindows();
  }

  private configFallbackWindows(): TimeWindowRow[] {
    return [
      ...MARKET_RDC.peakHours.map((p) => ({
        kind: PricingTimeKind.PEAK,
        startHour: p.start,
        endHour: p.end,
        isActive: true,
      })),
      {
        kind: PricingTimeKind.NIGHT,
        startHour: MARKET_RDC.nightHours.start,
        endHour: MARKET_RDC.nightHours.end,
        isActive: true,
      },
    ];
  }

  private validateHours(startHour: number, endHour: number) {
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Heure de début invalide (0–23).');
    }
    if (!Number.isInteger(endHour) || endHour < 0 || endHour > 23) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Heure de fin invalide (0–23).');
    }
    if (startHour === endHour) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'La plage horaire ne peut pas être vide.');
    }
  }

  static defaultSeedRows() {
    return DEFAULT_TIME_WINDOWS;
  }
}
