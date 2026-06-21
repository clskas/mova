import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePartnerVehicleDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiProperty({ example: 'ECONOMY' })
  @IsString()
  category!: string;

  @ApiPropertyOptional({ example: 'MANUAL' })
  @IsOptional()
  @IsString()
  transmission?: string;

  @ApiPropertyOptional({ example: 'Kinshasa' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;

  @ApiProperty({ example: 85000 })
  @IsInt()
  @Min(1)
  dailyRateCdf!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  depositCdf?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerContactPhone?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UploadPartnerVehiclePhotoDto {
  @ApiProperty()
  @IsString()
  imageBase64!: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class PartnerBookingActionDto {
  @ApiProperty({ enum: ['acknowledge', 'confirm', 'decline', 'start', 'return'] })
  @IsIn(['acknowledge', 'confirm', 'decline', 'start', 'return'])
  action!: 'acknowledge' | 'confirm' | 'decline' | 'start' | 'return';
}

export class PartnerLogisticsDto {
  @ApiProperty({ enum: ['SELF_PASSENGER', 'OWNER_DRIVER'] })
  @IsIn(['SELF_PASSENGER', 'OWNER_DRIVER'])
  logisticsMode!: 'SELF_PASSENGER' | 'OWNER_DRIVER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerDriverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerDriverPhone?: string;
}
