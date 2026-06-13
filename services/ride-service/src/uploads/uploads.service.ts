import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'parcels');

@Injectable()
export class UploadsService {
  async uploadParcelPhoto(base64: string, mimeType = 'image/jpeg'): Promise<{ photoUrl: string; cloudinaryMockUrl: string }> {
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
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${id}.${ext}`;
    await writeFile(join(UPLOAD_DIR, filename), buffer);

    const photoUrl = `/api/uploads/parcels/${filename}`;
    const cloudinaryMockUrl = `https://res.cloudinary.com/mova-mock/image/upload/v1/parcels/${filename}`;
    return { photoUrl, cloudinaryMockUrl };
  }
}
