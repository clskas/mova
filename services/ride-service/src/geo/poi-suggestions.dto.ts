import { PlaceOfInterestCategory } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePoiSuggestionDto {
  @ApiProperty({ example: 'Marché Gambela' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: PlaceOfInterestCategory })
  @IsEnum(PlaceOfInterestCategory)
  category!: PlaceOfInterestCategory;

  @ApiProperty()
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @IsNumber()
  lng!: number;

  @ApiProperty({ example: 'Kinshasa' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiProperty({ required: false, description: 'Précisions pour la validation admin' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectPoiSuggestionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reviewedBy?: string;
}

export class ApprovePoiSuggestionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reviewedBy?: string;
}
