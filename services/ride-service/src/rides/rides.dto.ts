import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { RideStatus, VehicleType } from '@prisma/client';
import { normalizeVehicleType } from '@mova/shared';

function toVehicleType(value: unknown): VehicleType {
  if (typeof value === 'string') return normalizeVehicleType(value) as VehicleType;
  return value as VehicleType;
}

export class EstimateRideDto {
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty({ enum: ['MOTO', 'MOTO_TAXI', 'STANDARD', 'CONFORT', 'COMFORT', 'VIP'] })
  @Transform(({ value }) => toVehicleType(value))
  @IsEnum(VehicleType)
  vehicleType: VehicleType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() promoCode?: string;
}

export class CreateRideDto extends EstimateRideDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() pickupAddress?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dropoffAddress?: string;
}

export class UpdateRideStatusDto {
  @ApiProperty({
    enum: [
      'REQUESTED',
      'MATCHING',
      'DRIVER_ASSIGNED',
      'ARRIVING',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      ...Object.values(RideStatus),
    ],
  })
  @IsString()
  status: string;
}

export class CancelRideDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}
