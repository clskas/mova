/* eslint-disable */
module.exports.writeAll = function writeAll(w) {
  w('services/ride-service/src/matching/matching.service.ts', `import { Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { INTERNAL_API_KEY, MARKET_RDC, serviceUrl } from '@mova/shared';

export interface DriverCandidate {
  driverId: string;
  userId: string;
  lat: number;
  lng: number;
  rating: number;
  distanceKm: number;
  score: number;
  vehicleId?: string;
}

@Injectable()
export class MatchingService {
  async findDrivers(lat: number, lng: number, vehicleType: VehicleType, searchAttempt = 0): Promise<DriverCandidate[]> {
    const url = serviceUrl('driver', \`/internal/drivers/nearby?lat=\${lat}&lng=\${lng}&vehicleType=\${vehicleType}&searchAttempt=\${searchAttempt}\`);
    const res = await fetch(url, { headers: { 'x-internal-api-key': INTERNAL_API_KEY } });
    if (!res.ok) return [];
    return res.json();
  }

  getMatchingMeta(searchAttempt = 0) {
    const radiusKm = Math.min(
      MARKET_RDC.matching.initialRadiusKm + searchAttempt * MARKET_RDC.matching.radiusIncrementKm,
      MARKET_RDC.matching.maxRadiusKm,
    );
    return {
      radiusKm,
      nextRadiusKm: Math.min(radiusKm + MARKET_RDC.matching.radiusIncrementKm, MARKET_RDC.matching.maxRadiusKm),
      incrementIntervalSec: MARKET_RDC.matching.radiusIncrementIntervalSec,
      maxRadiusKm: MARKET_RDC.matching.maxRadiusKm,
    };
  }
}
`);

  w('services/ride-service/src/matching/matching.module.ts', `import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
@Module({ providers: [MatchingService], exports: [MatchingService] })
export class MatchingModule {}
`);

  w('services/ride-service/src/rides/pricing.service.ts', `import { Injectable } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { MARKET_RDC } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async estimateFare(vehicleType: VehicleType, distanceKm: number, durationMin: number) {
    const rule = await this.prisma.pricingRule.findUnique({ where: { vehicleType } });
    if (!rule) throw new Error(\`Tarif non configuré pour \${vehicleType}\`);
    const multiplier = this.getSurchargeMultiplier();
    const base = rule.baseFareCdf;
    const distance = Math.ceil(distanceKm * rule.perKmCdf);
    const duration = Math.ceil(durationMin * rule.perMinuteCdf);
    const subtotal = base + distance + duration;
    const total = Math.max(Math.ceil(subtotal * multiplier), rule.minFareCdf);
    return { vehicleType, baseFareCdf: base, distanceFareCdf: distance, durationFareCdf: duration, surchargeMultiplier: multiplier, estimatedFareCdf: total, formatted: \`\${total.toLocaleString('fr-CD')} FC\`, currency: MARKET_RDC.currency };
  }

  private getSurchargeMultiplier(): number {
    const hour = new Date().getHours();
    const isPeak = MARKET_RDC.peakHours.some((p) => hour >= p.start && hour < p.end);
    const isNight = hour >= MARKET_RDC.nightHours.start || hour < MARKET_RDC.nightHours.end;
    if (isPeak && isNight) return 1.5;
    if (isPeak) return 1.3;
    if (isNight) return 1.2;
    return 1.0;
  }

  haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
`);

  w('services/ride-service/src/rides/rides.dto.ts', `import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { RideStatus, VehicleType } from '@prisma/client';

export class EstimateRideDto {
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty({ enum: VehicleType }) @IsEnum(VehicleType) vehicleType: VehicleType;
}

export class CreateRideDto extends EstimateRideDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() pickupAddress?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dropoffAddress?: string;
}

export class UpdateRideStatusDto {
  @ApiProperty({ enum: RideStatus }) @IsEnum(RideStatus) status: RideStatus;
}

export class CancelRideDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
`);

  w('services/ride-service/src/rides/rides.service.ts', `import { HttpStatus, Injectable } from '@nestjs/common';
import { RideStatus, VehicleType } from '@prisma/client';
import { MOVA_EVENTS, MovaErrorCode, MovaHttpException, RideCreatedPayload, MARKET_RDC } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { MatchingService } from '../matching/matching.service';

@Injectable()
export class RidesService {
  constructor(private prisma: PrismaService, private pricing: PricingService, private matching: MatchingService, private redis: RedisService) {}

  async estimate(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, vehicleType: VehicleType) {
    const distanceKm = this.pricing.haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const durationMin = (distanceKm / 25) * 60;
    return this.pricing.estimateFare(vehicleType, distanceKm, durationMin);
  }

  async createRide(passengerId: string, data: { pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number; vehicleType: VehicleType; pickupAddress?: string; dropoffAddress?: string }) {
    const active = await this.prisma.ride.findFirst({ where: { passengerId, status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVED, RideStatus.IN_PROGRESS] } } });
    if (active) throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_ACTIVE);
    const estimate = await this.estimate(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng, data.vehicleType);
    const distanceKm = this.pricing.haversineKm(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng);
    const ride = await this.prisma.ride.create({
      data: { passengerId, status: RideStatus.SEARCHING, vehicleType: data.vehicleType, pickupLat: data.pickupLat, pickupLng: data.pickupLng, pickupAddress: data.pickupAddress, dropoffLat: data.dropoffLat, dropoffLng: data.dropoffLng, dropoffAddress: data.dropoffAddress, estimatedFareCdf: estimate.estimatedFareCdf, distanceKm, durationMin: (distanceKm / 25) * 60 },
    });
    await this.prisma.rideEvent.create({ data: { rideId: ride.id, event: 'CREATED' } });
    const drivers = await this.matching.findDrivers(data.pickupLat, data.pickupLng, data.vehicleType);
    const payload: RideCreatedPayload = { rideId: ride.id, passengerId, vehicleType: data.vehicleType, estimatedFareCdf: estimate.estimatedFareCdf };
    await this.redis.publish(MOVA_EVENTS.RIDE_CREATED, payload);
    return { ride, estimate, availableDrivers: drivers.length, matching: this.matching.getMatchingMeta() };
  }

  async searchDrivers(rideId: string, passengerId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== passengerId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (ride.status !== RideStatus.SEARCHING) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    const attempts = await this.prisma.rideEvent.count({ where: { rideId, event: 'SEARCH_ATTEMPT' } });
    const drivers = await this.matching.findDrivers(ride.pickupLat, ride.pickupLng, ride.vehicleType, attempts);
    await this.prisma.rideEvent.create({ data: { rideId, event: 'SEARCH_ATTEMPT', metadata: { attempt: attempts, driversFound: drivers.length } } });
    const meta = this.matching.getMatchingMeta(attempts);
    if (drivers.length === 0 && meta.radiusKm >= MARKET_RDC.matching.maxRadiusKm) throw new MovaHttpException(MovaErrorCode.RIDE_NO_DRIVERS);
    return { rideId, attempt: attempts, ...meta, drivers };
  }

  async acceptRide(rideId: string, driverUserId: string, vehicleId?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status !== RideStatus.SEARCHING) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    return this.prisma.ride.update({ where: { id: rideId }, data: { driverId: driverUserId, vehicleId, status: RideStatus.ACCEPTED, acceptedAt: new Date() } });
  }

  async updateStatus(rideId: string, status: RideStatus, userId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updates: Record<string, unknown> = { status };
    if (status === RideStatus.IN_PROGRESS) updates.startedAt = new Date();
    if (status === RideStatus.COMPLETED) updates.completedAt = new Date();
    if (status === RideStatus.CANCELLED) { updates.cancelledAt = new Date(); updates.cancelledBy = userId; }
    const updated = await this.prisma.ride.update({ where: { id: rideId }, data: updates });
    await this.prisma.rideEvent.create({ data: { rideId, event: status } });
    if (status === RideStatus.COMPLETED) await this.redis.publish(MOVA_EVENTS.RIDE_COMPLETED, { rideId, passengerId: ride.passengerId, driverId: ride.driverId });
    return updated;
  }

  async cancelRide(rideId: string, userId: string, reason?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const policy = await this.prisma.cancellationPolicy.findUnique({ where: { vehicleType: ride.vehicleType } });
    let feeCdf = 0;
    if (ride.acceptedAt && policy) {
      const minutesSinceAccept = (Date.now() - ride.acceptedAt.getTime()) / 60000;
      if (minutesSinceAccept > policy.freeCancelMinutes) feeCdf = policy.passengerFeeCdf;
    }
    const updated = await this.prisma.ride.update({ where: { id: rideId }, data: { status: RideStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason } });
    return { ride: updated, cancellationFeeCdf: feeCdf };
  }

  async getRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId }, include: { events: { orderBy: { createdAt: 'asc' } }, ratings: true } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return ride;
  }

  async getUserRides(userId: string, role: 'passenger' | 'driver') {
    return this.prisma.ride.findMany({ where: role === 'passenger' ? { passengerId: userId } : { driverId: userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async getDriverEarnings(driverUserId: string) {
    const rides = await this.prisma.ride.findMany({ where: { driverId: driverUserId, status: RideStatus.COMPLETED } });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sum = (from: Date) => rides.filter((r) => r.completedAt && r.completedAt >= from).reduce((a, r) => a + (r.finalFareCdf ?? r.estimatedFareCdf ?? 0), 0);
    return { totalCdf: sum(new Date(0)), todayCdf: sum(startOfDay), weekCdf: sum(startOfWeek), monthCdf: sum(startOfMonth), rideCount: rides.length };
  }

  async getStats() {
    const [rides, completed, revenue] = await Promise.all([
      this.prisma.ride.count(),
      this.prisma.ride.count({ where: { status: RideStatus.COMPLETED } }),
      this.prisma.ride.aggregate({ where: { status: RideStatus.COMPLETED }, _sum: { finalFareCdf: true, estimatedFareCdf: true } }),
    ]);
    return { rides, completed, revenueCdf: (revenue._sum.finalFareCdf ?? 0) + (revenue._sum.estimatedFareCdf ?? 0) };
  }
}
`);

  w('services/ride-service/src/rides/rides.controller.ts', `import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CancelRideDto, CreateRideDto, EstimateRideDto, UpdateRideStatusDto } from './rides.dto';
import { RidesService } from './rides.service';

@ApiTags('rides')
@Controller('rides')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RidesController {
  constructor(private ridesService: RidesService) {}
  @Post('estimate') @ApiOperation({ summary: 'Estimer tarif' }) estimate(@Body() dto: EstimateRideDto) { return this.ridesService.estimate(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng, dto.vehicleType); }
  @Post() @ApiOperation({ summary: 'Créer une course' }) create(@Request() req: { user: { id: string } }, @Body() dto: CreateRideDto) { return this.ridesService.createRide(req.user.id, dto); }
  @Get() @ApiOperation({ summary: 'Historique courses' }) list(@Request() req: { user: { id: string; role: string } }, @Query('role') role?: string) { return this.ridesService.getUserRides(req.user.id, (role === 'driver' ? 'driver' : 'passenger') as 'passenger' | 'driver'); }
  @Get(':id') @ApiOperation({ summary: 'Détail course' }) get(@Param('id') id: string) { return this.ridesService.getRide(id); }
  @Post(':id/search') @ApiOperation({ summary: 'Rechercher chauffeurs' }) search(@Request() req: { user: { id: string } }, @Param('id') id: string) { return this.ridesService.searchDrivers(id, req.user.id); }
  @Post(':id/accept') @ApiOperation({ summary: 'Accepter course (chauffeur)' }) accept(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body('vehicleId') vehicleId?: string) { return this.ridesService.acceptRide(id, req.user.id, vehicleId); }
  @Patch(':id/status') @ApiOperation({ summary: 'Mettre à jour statut' }) status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateRideStatusDto) { return this.ridesService.updateStatus(id, dto.status, req.user.id); }
  @Post(':id/cancel') @ApiOperation({ summary: 'Annuler course' }) cancel(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: CancelRideDto) { return this.ridesService.cancelRide(id, req.user.id, dto.reason); }
}
`);

  w('services/ride-service/src/rides/rides.module.ts', `import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { PricingService } from './pricing.service';
import { MatchingModule } from '../matching/matching.module';
@Module({ imports: [MatchingModule], controllers: [RidesController], providers: [RidesService, PricingService], exports: [RidesService] })
export class RidesModule {}
`);

  w('services/ride-service/src/geo/geo.service.ts', `import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class GeoService {
  constructor(private prisma: PrismaService) {}
  getCommunes(city = 'Kinshasa') { return this.prisma.commune.findMany({ where: { city }, orderBy: { name: 'asc' } }); }
}
`);

  w('services/ride-service/src/geo/geo.controller.ts', `import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeoService } from './geo.service';
@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private geo: GeoService) {}
  @Get('communes') @ApiOperation({ summary: 'Communes Kinshasa' }) communes(@Query('city') city?: string) { return this.geo.getCommunes(city); }
}
`);

  w('services/ride-service/src/geo/geo.module.ts', `import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
@Module({ controllers: [GeoController], providers: [GeoService] })
export class GeoModule {}
`);

  w('services/ride-service/src/ratings/ratings.dto.ts', `import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
export class CreateRatingDto {
  @ApiProperty() @IsUUID() rideId: string;
  @ApiProperty() @IsUUID() toUserId: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) score: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() comment?: string;
}
`);

  w('services/ride-service/src/ratings/ratings.service.ts', `import { Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, MOVA_EVENTS, serviceUrl } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './ratings.dto';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}
  async create(fromUserId: string, dto: CreateRatingDto) {
    const rating = await this.prisma.rating.create({ data: { rideId: dto.rideId, fromUserId, toUserId: dto.toUserId, score: dto.score, comment: dto.comment } });
    const avg = await this.prisma.rating.aggregate({ where: { toUserId: dto.toUserId }, _avg: { score: true } });
    if (avg._avg.score) {
      await fetch(serviceUrl('driver', \`/internal/drivers/\${dto.toUserId}/rating\`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ ratingAvg: avg._avg.score }),
      });
      await this.redis.publish(MOVA_EVENTS.DRIVER_RATING_UPDATED, { userId: dto.toUserId, ratingAvg: avg._avg.score });
    }
    return rating;
  }
}
`);

  w('services/ride-service/src/ratings/ratings.controller.ts', `import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRatingDto } from './ratings.dto';
import { RatingsService } from './ratings.service';
@ApiTags('ratings')
@Controller('ratings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RatingsController {
  constructor(private ratings: RatingsService) {}
  @Post() @ApiOperation({ summary: 'Noter un utilisateur' }) create(@Request() req: { user: { id: string } }, @Body() dto: CreateRatingDto) { return this.ratings.create(req.user.id, dto); }
}
`);

  w('services/ride-service/src/ratings/ratings.module.ts', `import { Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
@Module({ controllers: [RatingsController], providers: [RatingsService] })
export class RatingsModule {}
`);

  w('services/ride-service/src/websocket/tracking.gateway.ts', `import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { INTERNAL_API_KEY, serviceUrl } from '@mova/shared';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/tracking' })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TrackingGateway.name);

  handleConnection(client: Socket) { this.logger.log(\`Client connected: \${client.id}\`); client.emit('ping', { ts: Date.now() }); }
  handleDisconnect(client: Socket) { this.logger.log(\`Client disconnected: \${client.id}\`); }

  @SubscribeMessage('driver:location')
  async handleDriverLocation(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string; lat: number; lng: number; rideId?: string }) {
    if (data.userId) {
      await fetch(serviceUrl('driver', '/drivers/location'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${client.handshake.auth?.token ?? ''}\` },
        body: JSON.stringify({ lat: data.lat, lng: data.lng }),
      }).catch(() =>
        fetch(serviceUrl('driver', \`/internal/drivers/\${data.userId}/location\`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
          body: JSON.stringify({ lat: data.lat, lng: data.lng }),
        }),
      );
    }
    if (data.rideId) this.server.to(\`ride:\${data.rideId}\`).emit('driver:location', { lat: data.lat, lng: data.lng, ts: Date.now() });
    return { success: true };
  }

  @SubscribeMessage('ride:subscribe')
  handleRideSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { rideId: string }) {
    client.join(\`ride:\${data.rideId}\`);
    return { subscribed: data.rideId };
  }

  @SubscribeMessage('ride:status')
  handleRideStatus(@MessageBody() data: { rideId: string; status: string }) {
    this.server.to(\`ride:\${data.rideId}\`).emit('ride:status', data);
    return { broadcast: true };
  }
}
`);

  w('services/ride-service/src/websocket/websocket.module.ts', `import { Module } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';
@Module({ providers: [TrackingGateway] })
export class WebsocketModule {}
`);

  w('services/ride-service/src/internal/internal.controller.ts', `import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../common/internal-api.guard';
import { RidesService } from '../rides/rides.service';
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private rides: RidesService) {}
  @Get('rides/:id') getRide(@Param('id') id: string) { return this.rides.getRide(id); }
  @Get('rides/driver/:userId/earnings') earnings(@Param('userId') userId: string) { return this.rides.getDriverEarnings(userId); }
  @Get('rides/stats') stats() { return this.rides.getStats(); }
}
`);

  w('services/ride-service/src/internal/internal.module.ts', `import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { RidesModule } from '../rides/rides.module';
@Module({ imports: [RidesModule], controllers: [InternalController] })
export class InternalModule {}
`);

  w('services/ride-service/src/app.module.ts', `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { RidesModule } from './rides/rides.module';
import { GeoModule } from './geo/geo.module';
import { RatingsModule } from './ratings/ratings.module';
import { MatchingModule } from './matching/matching.module';
import { WebsocketModule } from './websocket/websocket.module';
import { InternalModule } from './internal/internal.module';
import { AuthModule } from './auth/auth.module';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, PrismaModule, HealthModule, AuthModule, RidesModule, GeoModule, RatingsModule, MatchingModule, WebsocketModule, InternalModule] })
export class AppModule {}
`);

  w('services/ride-service/src/auth/auth.module.ts', `import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({ imports: [ConfigModule], useFactory: (c: ConfigService) => ({ secret: c.get('JWT_SECRET') ?? 'dev_secret' }), inject: [ConfigService] }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
`);
};
