import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, MinLength } from 'class-validator';

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
}
