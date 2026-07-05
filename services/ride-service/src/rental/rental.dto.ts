import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class RentalVehicleQueryDto {
  @ApiPropertyOptional({ example: 'Kinshasa' }) @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional({ example: 'SUV', description: 'ECONOMY | SUV | PREMIUM' }) @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @ApiPropertyOptional({ enum: ['AUTO', 'MANUAL'] }) @IsOptional() @IsIn(['AUTO', 'MANUAL']) transmission?: string;
  @ApiPropertyOptional({ enum: ['price_asc', 'price_desc', 'rating', 'category'] })
  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'rating', 'category'])
  sort?: string;
}

export class RentalAddOnsDto {
  @ApiPropertyOptional() @IsOptional() childSeat?: boolean;
  @ApiPropertyOptional() @IsOptional() gps?: boolean;
  @ApiPropertyOptional() @IsOptional() extraDriver?: boolean;
}

export class RentalQuoteDto {
  @ApiProperty() @IsUUID() vehicleId!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional({ enum: ['HOURLY', 'DAILY', 'WEEKLY'] }) @IsOptional() @IsIn(['HOURLY', 'DAILY', 'WEEKLY']) rentalPeriod?: string;
  @ApiPropertyOptional({ example: 'Kinshasa' }) @IsOptional() @IsString() pickupCity?: string;
  @ApiPropertyOptional({ example: 'Kinshasa' }) @IsOptional() @IsString() returnCity?: string;
  @ApiPropertyOptional({ enum: ['UNLIMITED', 'LIMITED'] }) @IsOptional() @IsIn(['UNLIMITED', 'LIMITED']) mileageType?: string;
  @ApiPropertyOptional({ enum: ['BASIC', 'STANDARD', 'PREMIUM'] })
  @IsOptional()
  @IsIn(['BASIC', 'STANDARD', 'PREMIUM'])
  insuranceTier?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() addOns?: RentalAddOnsDto;
  @ApiPropertyOptional() @IsOptional() @IsString() promoCode?: string;
}

/** @deprecated Alias — utiliser RentalQuoteDto */
export class RentalEstimateDto extends RentalQuoteDto {}

export class CreateRentalInquiryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleType?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional({ enum: ['HOURLY', 'DAILY', 'WEEKLY'] }) @IsOptional() @IsIn(['HOURLY', 'DAILY', 'WEEKLY']) rentalPeriod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pickupCity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() returnCity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pickupAddress?: string;
  @ApiPropertyOptional({ enum: ['UNLIMITED', 'LIMITED'] }) @IsOptional() @IsIn(['UNLIMITED', 'LIMITED']) mileageType?: string;
  @ApiPropertyOptional({ enum: ['BASIC', 'STANDARD', 'PREMIUM'] })
  @IsOptional()
  @IsIn(['BASIC', 'STANDARD', 'PREMIUM'])
  insuranceTier?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() addOns?: RentalAddOnsDto;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() promoCode?: string;
}

export class CreateRentalBookingDto extends RentalQuoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() pickupAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({
    enum: ['SELF_PASSENGER', 'PASSENGER_DRIVER', 'MOVA_DRIVER'],
    description: 'Mode logistique choisi par le passager',
  })
  @IsOptional()
  @IsIn(['SELF_PASSENGER', 'PASSENGER_DRIVER', 'MOVA_DRIVER'])
  logisticsMode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passengerDriverName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passengerDriverPhone?: string;
}
