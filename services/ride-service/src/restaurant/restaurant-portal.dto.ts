import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class MenuItemDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsInt() @Min(1) unitPriceCdf: number;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAvailable?: boolean;
}

export class UpdateRestaurantMenuDto {
  @ApiPropertyOptional({ type: [MenuItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menuItems?: MenuItemDto[];

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

export class UpdateRestaurantLocationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cuisine?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lng?: number;
}
