import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
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
  @ApiProperty({ enum: ['MOTO', 'MOTO_TAXI', 'STANDARD', 'TAXI', 'CONFORT', 'COMFORT', 'VIP'] })
  @Transform(({ value }) => toVehicleType(value))
  @IsEnum(VehicleType)
  vehicleType: VehicleType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() promoCode?: string;
  @ApiProperty({ required: false, description: 'Aller-retour immédiat (même chauffeur, tarif ≈ 2×)' })
  @IsOptional()
  @IsBoolean()
  roundTrip?: boolean;
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

export class NearbyVehiclesQueryDto {
  @ApiProperty() @Type(() => Number) @IsNumber() lat: number;
  @ApiProperty() @Type(() => Number) @IsNumber() lng: number;
  @ApiProperty({ enum: ['MOTO', 'MOTO_TAXI', 'STANDARD', 'TAXI', 'CONFORT', 'COMFORT', 'VIP'] })
  @Transform(({ value }) => toVehicleType(value))
  @IsEnum(VehicleType)
  vehicleType: VehicleType;
}

/** Uber Pool — estimation tarif partagé. */
export class EstimateSharedRideDto {
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty({ required: false, enum: ['STANDARD', 'TAXI', 'CONFORT', 'COMFORT', 'VIP'] })
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? VehicleType.STANDARD : toVehicleType(value)))
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() promoCode?: string;
}

export class RequestSharedRideDto extends EstimateSharedRideDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() pickupAddress?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dropoffAddress?: string;
  @ApiProperty({ required: false, description: 'Places demandées (1–3)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  seats?: number;
}
