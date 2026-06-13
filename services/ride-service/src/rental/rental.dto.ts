import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRentalInquiryDto {
  @ApiProperty({ example: 'SUV' }) @IsString() vehicleType!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pickupAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class RentalEstimateDto {
  @ApiProperty() @IsUUID() vehicleId!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
}

export class CreateRentalBookingDto extends RentalEstimateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() pickupAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
