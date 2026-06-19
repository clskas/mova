import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRestaurantMenuDto {
  @ApiPropertyOptional() @IsOptional() @IsArray() menuItems?: unknown[];
  @ApiPropertyOptional() @IsOptional() @IsString() promotionLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAcceptingOrders?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(5) prepTimeMin?: number;
}

export class RejectOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
