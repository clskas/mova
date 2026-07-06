import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
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
  @ApiOperation({ summary: 'Téléverser photo plat (stockage local / mock Cloudinary)' })
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

  @Get('parcels/:filename')
  @ApiOperation({ summary: 'Télécharger une photo colis stockée localement' })
  serveParcelPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.serveUploadedFile('parcels', filename, res);
  }

  @Get('menu/:filename')
  @ApiOperation({ summary: 'Télécharger une photo plat stockée localement' })
  serveMenuPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.serveUploadedFile('menu', filename, res);
  }

  @Get('vehicles/:filename')
  @ApiOperation({ summary: 'Télécharger une photo véhicule stockée localement' })
  serveVehiclePhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.serveUploadedFile('vehicles', filename, res);
  }

  @Get('moving/:filename')
  @ApiOperation({ summary: 'Télécharger une photo déménagement stockée localement' })
  serveMovingPhoto(@Param('filename') filename: string, @Res() res: Response) {
    return this.serveUploadedFile('moving', filename, res);
  }

  private serveUploadedFile(category: 'parcels' | 'menu' | 'vehicles' | 'moving', filename: string, res: Response) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = join(process.cwd(), 'uploads', category, safe);
    if (!existsSync(filePath)) throw new NotFoundException('Fichier introuvable');
    const ext = safe.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.sendFile(filePath);
  }
}
