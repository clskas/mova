import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

/** Contrat mobile — courses & commissions via /deliveries/errand/* */
export class MobileErrandEstimateDto {
  @ApiProperty() @IsString() @MinLength(3) deliveryAddress!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) items!: string[];
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
  @ApiProperty() @IsString() scheduledAt!: string;
  @ApiProperty({ default: 'STANDARD' }) vehicleType!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLng?: number;
}
