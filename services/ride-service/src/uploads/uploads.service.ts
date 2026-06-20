import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const MAX_BYTES = 5 * 1024 * 1024;
type UploadCategory = 'parcels' | 'menu' | 'vehicles';

@Injectable()
export class UploadsService {
  async uploadParcelPhoto(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('parcels', base64, mimeType);
  }

  async uploadMenuPhoto(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('menu', base64, mimeType);
  }

  async uploadVehiclePhoto(base64: string, mimeType = 'image/jpeg') {
    return this.uploadImage('vehicles', base64, mimeType);
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

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const id = randomUUID();
    const dir = join(process.cwd(), 'uploads', category);
    await mkdir(dir, { recursive: true });
    const filename = `${id}.${ext}`;
    await writeFile(join(dir, filename), buffer);

    const photoUrl = `/api/uploads/${category}/${filename}`;
    const cloudinaryMockUrl = `https://res.cloudinary.com/mova-mock/image/upload/v1/${category}/${filename}`;
    return { photoUrl, cloudinaryMockUrl };
  }
}
