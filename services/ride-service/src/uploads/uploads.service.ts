import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MovaErrorCode,
  MovaHttpException,
  isSupabaseStorageConfigured,
  supabaseKycBucket,
  supabaseUploadObject,
  supabaseUploadsBucket,
} from '@mova/shared';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const MAX_BYTES = 5 * 1024 * 1024;
type UploadCategory = 'parcels' | 'menu' | 'vehicles' | 'moving' | 'kyc';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private config: ConfigService) {}

  private get = (key: string) => this.config.get<string>(key);

  async uploadParcelPhoto(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('parcels', base64, mimeType);
  }

  async uploadMenuPhoto(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('menu', base64, mimeType);
  }

  async uploadVehiclePhoto(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('vehicles', base64, mimeType);
  }

  async uploadMovingPhoto(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('moving', base64, mimeType);
  }

  async uploadKycDocument(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('kyc', base64, mimeType);
  }

  private async uploadImage(category: UploadCategory, base64: string, mimeType = 'image/jpeg') {
    const raw = base64.includes(',') ? base64.split(',')[1]! : base64;
    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Image invalide ou vide.');
    }
    if (buffer.length > MAX_BYTES) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Image trop volumineuse (max 5 Mo).');
    }

    const ext = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
        ? 'webp'
        : mimeType.includes('pdf')
          ? 'pdf'
          : 'jpg';
    const id = randomUUID();
    const objectPath = `${category}/${id}.${ext}`;

    if (isSupabaseStorageConfigured(this.get)) {
      const bucket = category === 'kyc' ? supabaseKycBucket(this.get) : supabaseUploadsBucket(this.get);
      const result = await supabaseUploadObject(this.get, {
        bucket,
        objectPath,
        body: buffer,
        contentType: mimeType || 'application/octet-stream',
        signedUrlExpiresIn: 7 * 24 * 3600,
      });
      if (result.success) {
        const photoUrl = result.signedUrl ?? result.publicUrl ?? `supabase://${bucket}/${objectPath}`;
        return { photoUrl, cloudinaryMockUrl: photoUrl, storage: 'supabase', bucket, path: objectPath };
      }
      if (category === 'kyc') {
        this.logger.error(`Supabase KYC upload failed: ${result.message}`);
        throw new MovaHttpException(
          MovaErrorCode.INTERNAL_ERROR,
          HttpStatus.BAD_GATEWAY,
          result.message ?? 'Échec stockage document.',
        );
      }
      // Partner/menu photos: keep portals usable if Supabase is misconfigured.
      this.logger.warn(`Supabase upload failed, falling back to local: ${result.message}`);
    }

    const dir = join(process.cwd(), 'uploads', category);
    await mkdir(dir, { recursive: true });
    const filename = `${id}.${ext}`;
    await writeFile(join(dir, filename), buffer);

    const photoUrl = `/api/uploads/${category}/${filename}`;
    const cloudinaryMockUrl = `https://res.cloudinary.com/mova-mock/image/upload/v1/${category}/${filename}`;
    return { photoUrl, cloudinaryMockUrl, storage: 'local' as const };
  }
}
