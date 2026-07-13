import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { RidesService } from './rides.service';

@Injectable()
export class RideSearchScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RideSearchScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private rides: RidesService,
    private platformConfig: PlatformConfigService,
  ) {}

  onModuleInit() {
    const intervalSec = this.platformConfig.get().matching.radiusIncrementIntervalSec;
    const intervalMs = intervalSec * 1000;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(`Auto re-search actif (toutes les ${intervalSec}s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    const rides = await this.prisma.ride.findMany({
      where: { status: RideStatus.SEARCHING },
      select: { id: true },
      take: 50,
    });
    for (const ride of rides) {
      try {
        const lastAttempt = await this.prisma.rideEvent.findFirst({
          where: { rideId: ride.id, event: 'SEARCH_ATTEMPT' },
          orderBy: { createdAt: 'desc' },
        });
        if (!lastAttempt) continue;
        const elapsedSec = (Date.now() - lastAttempt.createdAt.getTime()) / 1000;
        if (elapsedSec < this.platformConfig.get().matching.radiusIncrementIntervalSec) continue;
        await this.rides.autoSearchDrivers(ride.id);
      } catch (err) {
        this.logger.warn(`Auto re-search échoué pour ${ride.id}: ${(err as Error).message}`);
      }
    }
  }
}
