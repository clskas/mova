import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  MergedPlatformConfig,
  PLATFORM_CONFIG_DEFAULTS,
  PlatformConfigOverrides,
} from './platform-config.types';

function mergeConfig(overrides: PlatformConfigOverrides): MergedPlatformConfig {
  const d = PLATFORM_CONFIG_DEFAULTS;
  const o = overrides ?? {};
  return {
    interCity: { ...d.interCity, ...o.interCity },
    delivery: { ...d.delivery, ...o.delivery },
    matching: {
      ...d.matching,
      ...o.matching,
      scoreWeights: { ...d.matching.scoreWeights, ...o.matching?.scoreWeights },
    },
    scheduled: { ...d.scheduled, ...o.scheduled },
    trip: {
      roadDistanceFactor: o.trip?.roadDistanceFactor ?? d.trip.roadDistanceFactor,
      averageSpeedKmh: { ...d.trip.averageSpeedKmh, ...o.trip?.averageSpeedKmh },
    },
    pricing: { ...d.pricing, ...o.pricing },
    carpool: { ...d.carpool, ...o.carpool },
  };
}

@Injectable()
export class PlatformConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlatformConfigService.name);
  private merged: MergedPlatformConfig = PLATFORM_CONFIG_DEFAULTS;
  private overrides: PlatformConfigOverrides = {};

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((err: unknown) => {
      this.logger.warn(`Platform config load skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  async refresh() {
    await this.ensureRow();
    const row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
    this.overrides = (row?.config as PlatformConfigOverrides) ?? {};
    this.merged = mergeConfig(this.overrides);
  }

  private async ensureRow() {
    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', config: {} },
      update: {},
    });
  }

  get(): MergedPlatformConfig {
    return this.merged;
  }

  getOverrides(): PlatformConfigOverrides {
    return this.overrides;
  }

  getDefaults(): MergedPlatformConfig {
    return PLATFORM_CONFIG_DEFAULTS;
  }

  interCitySurchargeCdf(distanceKm: number): number {
    const { baseSurchargeCdf, perKmSurchargeCdf } = this.merged.interCity;
    return Math.round(baseSurchargeCdf + distanceKm * perKmSurchargeCdf);
  }

  async update(patch: PlatformConfigOverrides) {
    await this.ensureRow();
    const next: PlatformConfigOverrides = {
      ...this.overrides,
      interCity: patch.interCity ? { ...this.overrides.interCity, ...patch.interCity } : this.overrides.interCity,
      delivery: patch.delivery ? { ...this.overrides.delivery, ...patch.delivery } : this.overrides.delivery,
      matching: patch.matching
        ? {
            ...this.overrides.matching,
            ...patch.matching,
            scoreWeights: patch.matching.scoreWeights
              ? { ...this.overrides.matching?.scoreWeights, ...patch.matching.scoreWeights }
              : this.overrides.matching?.scoreWeights,
          }
        : this.overrides.matching,
      scheduled: patch.scheduled ? { ...this.overrides.scheduled, ...patch.scheduled } : this.overrides.scheduled,
      trip: patch.trip
        ? {
            ...this.overrides.trip,
            ...patch.trip,
            averageSpeedKmh: patch.trip.averageSpeedKmh
              ? { ...this.overrides.trip?.averageSpeedKmh, ...patch.trip.averageSpeedKmh }
              : this.overrides.trip?.averageSpeedKmh,
          }
        : this.overrides.trip,
      pricing: patch.pricing ? { ...this.overrides.pricing, ...patch.pricing } : this.overrides.pricing,
      carpool: patch.carpool ? { ...this.overrides.carpool, ...patch.carpool } : this.overrides.carpool,
    };
    this.validate(next);
    const row = await this.prisma.platformConfig.update({
      where: { id: 'default' },
      data: { config: next as object },
    });
    this.overrides = (row.config as PlatformConfigOverrides) ?? {};
    this.merged = mergeConfig(this.overrides);
    return { config: this.merged, overrides: this.overrides, defaults: PLATFORM_CONFIG_DEFAULTS };
  }

  private validate(o: PlatformConfigOverrides) {
    const m = mergeConfig(o);
    if (m.interCity.baseSurchargeCdf < 0 || m.interCity.perKmSurchargeCdf < 0) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Majoration inter-ville invalide.');
    }
    if (m.matching.initialRadiusKm <= 0 || m.matching.maxRadiusKm < m.matching.initialRadiusKm) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Rayons de dispatch invalides.');
    }
    if (m.scheduled.lateCancelFeePct < 0 || m.scheduled.lateCancelFeePct > 100) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Pourcentage annulation tardive entre 0 et 100.');
    }
    const w = m.matching.scoreWeights;
    const weightSum = w.proximity + w.rating + w.acceptanceRate + w.seniority;
    if (Math.abs(weightSum - 1) > 0.01) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'La somme des poids de scoring doit être égale à 1.',
      );
    }
    if (m.trip.roadDistanceFactor < 1 || m.trip.roadDistanceFactor > 3) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Facteur de détour entre 1 et 3.');
    }
  }
}
