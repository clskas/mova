import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { DeliveryStatus, WeightCategory } from '@prisma/client';

export class CreateParcelDeliveryDto {
  @ApiProperty() @IsNumber() pickupLat: number;
  @ApiProperty() @IsNumber() pickupLng: number;
  @ApiProperty() @IsString() pickupAddress: string;
  @ApiProperty() @IsNumber() dropoffLat: number;
  @ApiProperty() @IsNumber() dropoffLng: number;
  @ApiProperty() @IsString() dropoffAddress: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() photoUrl?: string;
  @ApiProperty({ enum: WeightCategory }) @IsEnum(WeightCategory) weightCategory: WeightCategory;
}

export class FoodOrderItemDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPriceCdf: number;
}

export class CreateFoodDeliveryDto {
  @ApiProperty() @IsUUID() restaurantId: string;
  @ApiProperty({ type: [FoodOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FoodOrderItemDto)
  items: FoodOrderItemDto[];
  @ApiProperty() @IsString() deliveryAddress: string;
  @ApiProperty() @IsNumber() deliveryLat: number;
  @ApiProperty() @IsNumber() deliveryLng: number;
}

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus }) @IsEnum(DeliveryStatus) status: DeliveryStatus;
}
