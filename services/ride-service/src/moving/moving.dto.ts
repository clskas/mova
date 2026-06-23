import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovingRequestStatus, MovingVehicleCategory } from '@prisma/client';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class EstimateMovingDto {
  @ApiProperty({ description: 'Volume estimé en m³' }) @IsNumber() @Min(1) @Max(100) volumeM3: number;
  @ApiProperty({ enum: MovingVehicleCategory, description: 'Type d\'engin souhaité' })
  @IsEnum(MovingVehicleCategory)
  vehicleCategory: MovingVehicleCategory;
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty() @IsString() pickupAddress: string;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty() @IsString() dropoffAddress: string;
}

export class CreateMovingDto extends EstimateMovingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional({ type: [String], description: 'URLs photos inventaire (/api/uploads/...)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
  @ApiPropertyOptional({ description: 'Liste des meubles / cartons (texte libre)' })
  @IsOptional()
  @IsString()
  itemsNotes?: string;
}

export class UpdateMovingStatusDto {
  @ApiProperty({ enum: MovingRequestStatus })
  @IsEnum(MovingRequestStatus)
  status!: MovingRequestStatus;
}
