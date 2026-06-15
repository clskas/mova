import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCarpoolTripDto {
  @ApiProperty() @IsDateString() departureAt!: string;
  @ApiProperty() @IsNumber() pickupLat!: number;
  @ApiProperty() @IsNumber() pickupLng!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() pickupAddress?: string;
  @ApiProperty() @IsNumber() dropoffLat!: number;
  @ApiProperty() @IsNumber() dropoffLng!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() dropoffAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromCity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toCity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingPoint?: string;
  @ApiProperty({ default: 3 }) @Type(() => Number) @IsInt() @Min(1) @Max(6) seatsTotal!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(500) pricePerSeatCdf!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ladiesOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() instantBooking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleInfo?: string;
}

export class JoinCarpoolDto {
  @ApiProperty({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(6) seats!: number;
}

export class BookCarpoolDto extends JoinCarpoolDto {}

export class CarpoolSearchQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional({ enum: ['price', 'departure', 'rating'] })
  @IsOptional()
  @IsIn(['price', 'departure', 'rating'])
  sort?: 'price' | 'departure' | 'rating';
}

export class RateCarpoolDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(5) score!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class ListCarpoolQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLng?: number;
}
