import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { normalizeVehicleType } from '@mova/shared';

function toVehicleType(value: unknown): VehicleType {
  if (typeof value === 'string') return normalizeVehicleType(value) as VehicleType;
  return value as VehicleType;
}

/** Contrat mobile — courses & commissions via /deliveries/errand/* */
export class MobileErrandEstimateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) pickupAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLng?: number;
  @ApiProperty() @IsString() @MinLength(3) deliveryAddress!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) items!: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() budgetCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() promoCode?: string;
}

export class MobileErrandCreateDto extends MobileErrandEstimateDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() deliveryLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() deliveryLng?: number;
}

export class MobileCarpoolAddressDto {
  @ApiProperty() @IsString() fromAddress!: string;
  @ApiProperty() @IsString() toAddress!: string;
}

export class MobileCarpoolEstimateDto extends MobileCarpoolAddressDto {
  @ApiProperty({ default: 3 }) seats!: number;
}

export class MobileCarpoolCreateDto extends MobileCarpoolEstimateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() departureAt?: string;
  @ApiPropertyOptional() @IsOptional() pricePerSeatCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingPoint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() ladiesOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() instantBooking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleInfo?: string;
}

export class MobileScheduledEstimateDto {
  @ApiProperty() @IsString() dropoffAddress!: string;
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiProperty({ default: 'STANDARD', enum: ['MOTO', 'MOTO_TAXI', 'STANDARD', 'CONFORT', 'COMFORT', 'VIP'] })
  @Transform(({ value }) => toVehicleType(value))
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLng?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() promoCode?: string;
}
