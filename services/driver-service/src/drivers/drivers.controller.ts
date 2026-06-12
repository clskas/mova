import { Body, Controller, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DriversService } from './drivers.service';
class AvailabilityDto { @ApiProperty() @IsBoolean() isAvailable: boolean; }
class LocationDto { @ApiProperty() @IsNumber() lat: number; @ApiProperty() @IsNumber() lng: number; }
class KycUploadDto { @ApiProperty() @IsString() type: string; @ApiProperty() @IsString() url: string; }
@ApiTags('drivers')
@Controller('drivers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DriversController {
  constructor(private driversService: DriversService) {}
  @Patch('availability') availability(@Request() req: { user: { id: string } }, @Body() dto: AvailabilityDto) { return this.driversService.setAvailability(req.user.id, dto.isAvailable); }
  @Post('location') location(@Request() req: { user: { id: string } }, @Body() dto: LocationDto) { return this.driversService.updateLocation(req.user.id, dto.lat, dto.lng); }
  @Post('kyc') kyc(@Request() req: { user: { id: string } }, @Body() dto: KycUploadDto) { return this.driversService.uploadKyc(req.user.id, dto.type, dto.url); }
  @Get('earnings') earnings(@Request() req: { user: { id: string } }) { return this.driversService.getEarnings(req.user.id); }
  @Get('profile') profile(@Request() req: { user: { id: string } }) { return this.driversService.getProfile(req.user.id); }
}
