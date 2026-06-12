import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCarpoolTripDto {
  @ApiProperty() @IsDateString() departureAt!: string;
  @ApiProperty() @IsNumber() pickupLat!: number;
  @ApiProperty() @IsNumber() pickupLng!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() pickupAddress?: string;
  @ApiProperty() @IsNumber() dropoffLat!: number;
  @ApiProperty() @IsNumber() dropoffLng!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() dropoffAddress?: string;
  @ApiProperty({ default: 3 }) @Type(() => Number) @IsInt() @Min(1) @Max(6) seatsTotal!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(500) pricePerSeatCdf!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class JoinCarpoolDto {
  @ApiProperty({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(3) seats!: number;
}

export class ListCarpoolQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() pickupLng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dropoffLng?: number;
}
