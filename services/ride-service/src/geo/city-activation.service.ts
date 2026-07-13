import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DRC_SERVICE_AREAS, setCityActivationOverrides } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CityActivationService implements OnModuleInit {
  private readonly logger = new Logger(CityActivationService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((err: unknown) => {
      this.logger.warn(`City activation cache skipped: ${err instanceof Error ? err.message : String(err)}`);
    });
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
