import { ApiProperty } from '@nestjs/swagger';
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
