import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrandOrderStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateErrandOrderDto {
  @ApiProperty({ example: 'Acheter médicaments à la pharmacie du coin' })
  @IsString()
  @MinLength(5)
  description!: string;

  @ApiProperty() @IsString() pickupAddress!: string;
  @ApiProperty() @IsNumber() pickupLat!: number;
  @ApiProperty() @IsNumber() pickupLng!: number;
  @ApiProperty() @IsString() dropoffAddress!: string;
  @ApiProperty() @IsNumber() dropoffLat!: number;
  @ApiProperty() @IsNumber() dropoffLng!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() budgetCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() promoCode?: string;
}

export class UpdateErrandStatusDto {
  @ApiProperty({ enum: ErrandOrderStatus })
  @IsEnum(ErrandOrderStatus)
  status!: ErrandOrderStatus;

  @ApiPropertyOptional({ description: 'Montant des achats effectués (CDF), saisi à la complétion' })
  @IsOptional()
  @IsNumber()
  purchaseTotalCdf?: number;

  @ApiPropertyOptional({ description: 'URL photo preuve d\'achat (obligatoire pour COMPLETED)' })
  @IsOptional()
  @IsString()
  proofPhotoUrl?: string;
}

export class UpdateErrandProofDto {
  @ApiProperty() @IsString() proofPhotoUrl!: string;
}

export class RateErrandDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsNumber() courierScore!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
