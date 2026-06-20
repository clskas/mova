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
}

export class UpdateErrandStatusDto {
  @ApiProperty({ enum: ErrandOrderStatus })
  @IsEnum(ErrandOrderStatus)
  status!: ErrandOrderStatus;
}
