import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MenuSizeDto {
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priceCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) unitPriceCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
}

export class MenuOptionDto {
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priceCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) unitPriceCdf?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() group?: string;
}

export class MenuOptionGroupDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) min?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) max?: number;
  @ApiProperty({ type: [MenuOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuOptionDto)
  options: MenuOptionDto[];
}

export class MenuCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class MenuItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsInt() @Min(1) unitPriceCdf: number;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAvailable?: boolean;
  /** null = unlimited; omit to leave unchanged on partial clients */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number | null;
  @ApiPropertyOptional({ type: [MenuSizeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuSizeDto)
  sizes?: MenuSizeDto[];
  @ApiPropertyOptional({ type: [MenuOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuOptionDto)
  options?: MenuOptionDto[];
  @ApiPropertyOptional({ type: [MenuOptionGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuOptionGroupDto)
  optionGroups?: MenuOptionGroupDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ageRestricted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresPrescription?: boolean;
}

export class UpdateRestaurantMenuDto {
  /**
   * Flat item array (legacy + rich fields) OR structured `{ categories, items }`.
   * Prefer sibling `categories` + `menuItems` array for clarity.
   */
  @ApiPropertyOptional()
  @IsOptional()
  menuItems?: MenuItemDto[] | { categories?: MenuCategoryDto[]; items?: MenuItemDto[] };

  @ApiPropertyOptional({ type: [MenuCategoryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuCategoryDto)
  categories?: MenuCategoryDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() promotionLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAcceptingOrders?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(5) prepTimeMin?: number;
}

export class UploadMenuPhotoDto {
  @ApiProperty() @IsString() imageBase64: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mimeType?: string;
}

export class RejectOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class UpdateCourierModeDto {
  @ApiProperty({ enum: ['PLATFORM', 'OWN', 'HYBRID'] })
  @IsString()
  courierMode: 'PLATFORM' | 'OWN' | 'HYBRID';
}

export class AddRestaurantDriverDto {
  @ApiPropertyOptional() @IsOptional() @IsString() driverUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class AssignOwnDriverDto {
  @ApiProperty() @IsString() driverUserId: string;
}

export class UpdateRestaurantLocationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cuisine?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lng?: number;
  @ApiPropertyOptional({ description: 'Valide et finalise la fiche restaurant (onboarding)' })
  @IsOptional()
  @IsBoolean()
  completeSetup?: boolean;
}
