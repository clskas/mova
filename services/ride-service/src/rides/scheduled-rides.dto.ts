import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { VehicleType } from '@prisma/client';

export class CreateScheduledRideDto {
  @ApiProperty() @IsDateString() scheduledAt: string;
  @ApiProperty({ enum: VehicleType }) @IsEnum(VehicleType) vehicleType: VehicleType;
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() pickupAddress?: string;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dropoffAddress?: string;
}

export class CancelScheduledRideDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
