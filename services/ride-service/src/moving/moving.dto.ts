import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class EstimateMovingDto {
  @ApiProperty({ description: 'Volume estimé en m³' }) @IsNumber() @Min(1) @Max(100) volumeM3: number;
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty() @IsString() pickupAddress: string;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty() @IsString() dropoffAddress: string;
}

export class CreateMovingDto extends EstimateMovingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
}
