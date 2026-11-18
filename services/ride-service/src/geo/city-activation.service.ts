import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DRC_SERVICE_AREAS, setCityActivationOverrides } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { startSettingsRefresh } from '../platform/settings-refresh';

@Injectable()
export class CityActivationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CityActivationService.name);
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    void this.refresh().catch((err: unknown) => {
      this.logger.warn(`City activation cache skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
    // Several instances: pick up cities switched on / off through another one.
    this.refreshTimer = startSettingsRefresh(() => this.refresh(), this.logger, 'City activation');
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async refresh() {
    const cities = await this.prisma.city.findMany({
      select: {
        slug: true,
        name: true,
        isActive: true,
        province: { select: { isActive: true } },
      },
      orderBy: { name: 'asc' },
    });
    if (cities.length > 0) {
      setCityActivationOverrides(
        cities.map((c) => ({
          slug: c.slug,
          name: c.name,
          isActive: c.isActive && c.province.isActive,
        })),
      );
      return cities;
    }
    setCityActivationOverrides(
      DRC_SERVICE_AREAS.map((a) => ({ slug: a.id, name: a.name, isActive: a.active })),
    );
    return DRC_SERVICE_AREAS.map((a) => ({ slug: a.id, name: a.name, isActive: a.active }));
  }

  async setAllActive(isActive: boolean) {
    await this.prisma.city.updateMany({ data: { isActive } });
    return this.refresh();
  }

  async setAllProvincesActive(isActive: boolean) {
    const updated = await this.prisma.province.updateMany({ data: { isActive } });
    await this.refresh();
    return updated.count;
  }
}
