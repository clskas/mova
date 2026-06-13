import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadsService } from './uploads.service';

class UploadParcelPhotoDto {
  @ApiProperty({ description: 'Image base64 (avec ou sans préfixe data:)' })
  @IsString()
  imageBase64: string;

  @ApiProperty({ required: false, example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

@ApiTags('uploads')
@Controller('uploads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post('parcel-photo')
  @ApiOperation({ summary: 'Téléverser photo colis (mock Cloudinary + stockage local)' })
  uploadParcelPhoto(@Body() dto: UploadParcelPhotoDto) {
    return this.uploadsService.uploadParcelPhoto(dto.imageBase64, dto.mimeType);
  }
}
