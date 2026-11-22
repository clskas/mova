import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { runClusterTick, RedisService } from '@mova/shared';
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
    @Optional() private readonly clusterRedis?: RedisService,
  ) {}

  onModuleInit() {
    // Tick toutes les 5s ; le filtre elapsed utilise la config live (admin peut changer l'intervalle).
    this.timer = setInterval(() => void runClusterTick(this.clusterRedis, 'ride-search', 5_000, () => this.tick()), 5_000);
    this.logger.log('Auto re-search actif (tick 5s, intervalle effectif via platform-config)');
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
        // No driver after RIDE_SEARCH_MAX_MINUTES: stop the search (free cancel, passenger told).
        if (await this.rides.expireStaleSearch(ride.id)) continue;
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
