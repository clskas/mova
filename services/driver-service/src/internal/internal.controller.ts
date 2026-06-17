import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { KycStatus, VehicleType } from '@prisma/client';
import { DriversService } from '../drivers/drivers.service';
import { IncidentsService } from '../incidents/incidents.service';
import { InternalApiGuard } from '../common/internal-api.guard';

class CreateProfileDto { @IsString() userId: string; }
class NearbyQuery {
  @Type(() => Number) @IsNumber() lat: number;
  @Type(() => Number) @IsNumber() lng: number;
  @IsString() vehicleType: VehicleType;
  @IsOptional() @Type(() => Number) @IsNumber() searchAttempt?: number;
  @IsOptional() @IsString() city?: string;
}
class RatingDto { @IsNumber() ratingAvg: number; }
class ReviewKycDto {
  @IsBoolean() approved: boolean;
  @IsOptional() @IsString() notes?: string;
}
class UpdateDriverStatusDto {
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private drivers: DriversService, private incidents: IncidentsService) {}
  @Post('profiles') createProfile(@Body() dto: CreateProfileDto) { return this.drivers.createProfile(dto.userId); }
  @Get('drivers/nearby') nearby(@Query() q: NearbyQuery) {
    return this.drivers.findNearby(q.lat, q.lng, q.vehicleType as VehicleType, q.searchAttempt ?? 0, q.city);
  }
  @Get('drivers/count') count() { return this.drivers.countDrivers().then((count) => ({ count })); }
  @Get('drivers') listDrivers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('kycStatus') kycStatus?: KycStatus,
    @Query('isAvailable') isAvailable?: string,
  ) {
    return this.drivers.listDriversAdmin(Number(skip ?? 0), Number(take ?? 50), {
      kycStatus,
      isAvailable: isAvailable === undefined ? undefined : isAvailable === 'true',
    });
  }
  @Get('kyc/pending') pendingKyc() { return this.drivers.pendingKyc(); }
  @Post('kyc/:id/review') reviewKyc(@Param('id') id: string, @Body() dto: ReviewKycDto) { return this.drivers.approveKyc(id, dto.approved, dto.notes); }
  @Patch('drivers/:userId/kyc')
  reviewDriverKyc(@Param('userId') userId: string, @Body() dto: ReviewKycDto) {
    return this.drivers.setDriverKycStatus(userId, dto.approved, dto.notes);
  }
  @Get('drivers/:userId')
  getDriver(@Param('userId') userId: string) { return this.drivers.getProfile(userId); }
  @Patch('drivers/:userId/status')
  updateDriverStatus(@Param('userId') userId: string, @Body() dto: UpdateDriverStatusDto) {
    return this.drivers.updateDriverAdmin(userId, dto);
  }
  @Patch('drivers/:userId/rating') updateRating(@Param('userId') userId: string, @Body() dto: RatingDto) { return this.drivers.updateRating(userId, dto.ratingAvg); }
  @Patch('drivers/:userId/location') updateLocation(@Param('userId') userId: string, @Body() dto: { lat: number; lng: number }) { return this.drivers.updateLocation(userId, dto.lat, dto.lng); }
  @Get('incidents') listIncidents() { return this.incidents.list(); }
  @Post('incidents/:id/resolve') resolve(@Param('id') id: string, @Body('status') status: string) { return this.incidents.resolve(id, status ?? 'RESOLVED'); }
}
