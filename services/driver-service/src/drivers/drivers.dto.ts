import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class KycUploadDto {
  @ApiProperty({ description: 'Type document KYC (ID_PHOTO, SELFIE, DRIVERS_LICENSE, …)' })
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  url: string;
}

export class UpdateOnboardingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() licenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idDocumentNumber?: string;
  @ApiPropertyOptional({ description: 'Ville d’opération (catalogue SENGA RDC)' })
  @IsOptional()
  @IsString()
  operatingCity?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() licenseExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() insuranceExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() technicalInspectionExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fiscalStickerExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payoutProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payoutPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() charterAccepted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trainingCompleted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() cguAccepted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onboardingCompleted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() plateNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleMake?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleImageUrl?: string;
  @ApiPropertyOptional({ type: [String], description: 'Photos de l\'engin (5 max) ; la première est la photo principale' })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) vehiclePhotoUrls?: string[];
  @ApiPropertyOptional({ description: 'Places passagers (chauffeur non compris), 1–8 ; moto = 1' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) vehiclePassengerSeats?: number;
  @ApiPropertyOptional({ description: 'Volume utile (m³) — utilitaire 1–25, camion 5–100' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) vehicleCargoVolumeM3?: number;
}

export class ActivationPinDto {
  @ApiProperty({ description: 'Code PIN à 6 chiffres reçu après validation SENGA' })
  @IsString()
  @MinLength(6)
  pin: string;
}

export class DriverWithdrawDto {
  @ApiProperty({ description: 'Montant en FC (minimum SerdiPay 2300)' })
  @Type(() => Number)
  @IsInt()
  @Min(2300)
  amountCdf: number;

  @ApiPropertyOptional({
    description: 'Opérateur Mobile Money (sinon profil chauffeur)',
    enum: ['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'AFRIMONEY'],
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'Numéro MM (sinon profil chauffeur)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Code à 6 chiffres reçu sur le téléphone du compte (sauf retrait vers ce même numéro)' })
  @IsOptional()
  @IsString()
  otp?: string;
}
