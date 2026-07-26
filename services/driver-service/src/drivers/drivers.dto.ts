import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
  @ApiPropertyOptional() @IsOptional() @IsDateString() licenseExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() insuranceExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() technicalInspectionExpiry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payoutProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payoutPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() charterAccepted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trainingCompleted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onboardingCompleted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() plateNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleMake?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleImageUrl?: string;
}

export class ActivationPinDto {
  @ApiProperty({ description: 'Code PIN à 6 chiffres reçu après validation SENGA' })
  @IsString()
  @MinLength(6)
  pin: string;
}

export class DriverWithdrawDto {
  @ApiProperty({ description: 'Montant en FC (minimum 500)' })
  @Type(() => Number)
  @IsInt()
  @Min(500)
  amountCdf: number;
}
