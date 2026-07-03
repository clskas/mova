import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromoAbsorbedBy, PromoScope } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PartnerPromoDto {
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) discountPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) discountCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxUses?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() validUntil?: string;
  @ApiPropertyOptional({ enum: PromoScope }) @IsOptional() @IsEnum(PromoScope) scope?: PromoScope;
  @ApiPropertyOptional({ enum: PromoAbsorbedBy }) @IsOptional() @IsEnum(PromoAbsorbedBy) absorbedBy?: PromoAbsorbedBy;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) partnerAbsorbPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
