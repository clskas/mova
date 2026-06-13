import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { DeliveryStatus, WeightCategory } from '@prisma/client';

export class CreateParcelDeliveryDto {
  @ApiProperty({ description: 'Latitude GPS enlèvement (Kinshasa)' }) @IsNumber() pickupLat: number;
  @ApiProperty({ description: 'Longitude GPS enlèvement (Kinshasa)' }) @IsNumber() pickupLng: number;
  @ApiProperty() @IsString() pickupAddress: string;
  @ApiProperty({ description: 'Latitude GPS livraison (Kinshasa)' }) @IsNumber() dropoffLat: number;
  @ApiProperty({ description: 'Longitude GPS livraison (Kinshasa)' }) @IsNumber() dropoffLng: number;
  @ApiProperty() @IsString() dropoffAddress: string;
  @ApiProperty({ required: false, description: 'URL photo du colis (Cloudinary ou chemin local)' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
  @ApiProperty({ enum: WeightCategory }) @IsEnum(WeightCategory) weightCategory: WeightCategory;
  @ApiProperty({ required: false, description: 'Poids approximatif en kg' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(50)
  weightKg?: number;
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
