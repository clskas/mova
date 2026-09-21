import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
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

  @Post('menu-photo')
  @ApiOperation({ summary: 'Téléverser photo plat (PostgreSQL + Supabase si configuré)' })
  uploadMenuPhoto(@Body() dto: UploadParcelPhotoDto) {
    return this.uploadsService.uploadMenuPhoto(dto.imageBase64, dto.mimeType);
  }

  @Post('vehicle-photo')
  @ApiOperation({ summary: 'Téléverser photo véhicule (location ou chauffeur)' })
  uploadVehiclePhoto(@Body() dto: UploadParcelPhotoDto) {
    return this.uploadsService.uploadVehiclePhoto(dto.imageBase64, dto.mimeType);
  }

  @Post('moving-photo')
  @ApiOperation({ summary: 'Téléverser photo déménagement (inventaire)' })
  uploadMovingPhoto(@Body() dto: UploadParcelPhotoDto) {
    return this.uploadsService.uploadMovingPhoto(dto.imageBase64, dto.mimeType);
  }

  @Post('kyc-photo')
  @ApiOperation({ summary: 'Téléverser justificatif KYC chauffeur / partenaire' })
  uploadKycPhoto(@Body() dto: UploadParcelPhotoDto) {
    return this.uploadsService.uploadKycDocument(dto.imageBase64, dto.mimeType);
  }

  @Get('parcels/:filename')
  @ApiOperation({ summary: 'Télécharger une photo colis' })
  serveParcelPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.uploadsService.serveUploadedFile('parcels', filename, res);
  }

  @Get('menu/:filename')
  @ApiOperation({ summary: 'Télécharger une photo plat' })
  serveMenuPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.uploadsService.serveUploadedFile('menu', filename, res);
  }

  @Get('vehicles/:filename')
  @ApiOperation({ summary: 'Télécharger une photo véhicule' })
  serveVehiclePhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.uploadsService.serveUploadedFile('vehicles', filename, res);
  }

  @Get('moving/:filename')
  @ApiOperation({ summary: 'Télécharger une photo déménagement' })
  serveMovingPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.uploadsService.serveUploadedFile('moving', filename, res);
  }

  @Get('kyc/:filename')
  @ApiOperation({ summary: 'Télécharger un justificatif KYC (local ou Supabase)' })
  serveKycPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.uploadsService.serveUploadedFile('kyc', filename, res);
  }
}
