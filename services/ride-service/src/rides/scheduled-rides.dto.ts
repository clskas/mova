import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { VehicleType } from '@prisma/client';
import { normalizeVehicleType } from '@mova/shared';

function toVehicleType(value: unknown): VehicleType {
  if (typeof value === 'string') return normalizeVehicleType(value) as VehicleType;
  return value as VehicleType;
}

export class CreateScheduledRideDto {
  @ApiProperty() @IsDateString() scheduledAt: string;
  @ApiProperty({ enum: ['MOTO', 'MOTO_TAXI', 'STANDARD', 'CONFORT', 'COMFORT', 'VIP'] })
  @Transform(({ value }) => toVehicleType(value))
  @IsEnum(VehicleType)
  vehicleType: VehicleType;
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() pickupAddress?: string;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dropoffAddress?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() promoCode?: string;
}

export class CancelScheduledRideDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
