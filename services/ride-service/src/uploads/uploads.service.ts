import { HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MovaErrorCode,
  MovaHttpException,
  isSupabaseStorageConfigured,
  supabaseDownloadObject,
  supabaseKycBucket,
  supabaseUploadObject,
  supabaseUploadsBucket,
} from '@mova/shared';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

const MAX_BYTES = 5 * 1024 * 1024;
type UploadCategory = 'parcels' | 'menu' | 'vehicles' | 'moving' | 'kyc';

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  private get = (key: string) => this.config.get<string>(key);

  private get isProduction(): boolean {
    const env = (this.get('APP_ENV') ?? this.get('NODE_ENV') ?? '').toLowerCase();
    return env === 'production' || env === 'prod';
  }

  onModuleInit() {
    if (this.isProduction && !isSupabaseStorageConfigured(this.get)) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY absent — photos persistées en PostgreSQL (uploaded_media). Ajoutez la clé Supabase sur Render pour le stockage objet.',
      );
    }
  }

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

  private mimeForFilename(filename: string, fallback?: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    return fallback ?? 'application/octet-stream';
  }

  /**
   * Sert un fichier : cache disque → PostgreSQL → Supabase (après redeploy Render).
   */
  async serveUploadedFile(category: UploadCategory, filename: string, res: Response) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe) throw new NotFoundException('Fichier introuvable');
    const filePath = join(process.cwd(), 'uploads', category, safe);
    if (existsSync(filePath)) {
      res.setHeader('Content-Type', this.mimeForFilename(safe));
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.sendFile(filePath);
    }

    const fromDb = await this.prisma.uploadedMedia.findUnique({
      where: { category_filename: { category, filename: safe } },
    });
    if (fromDb) {
      await this.recacheLocal(category, safe, fromDb.data).catch(() => undefined);
      res.setHeader('Content-Type', fromDb.mimeType || this.mimeForFilename(safe));
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.send(Buffer.from(fromDb.data));
    }

    if (isSupabaseStorageConfigured(this.get)) {
      const bucket = category === 'kyc' ? supabaseKycBucket(this.get) : supabaseUploadsBucket(this.get);
      const objectPath = `${category}/${safe}`;
      const downloaded = await supabaseDownloadObject(this.get, { bucket, objectPath });
      if (downloaded.success && downloaded.body) {
        await this.persistDurable(category, safe, downloaded.body, downloaded.contentType ?? this.mimeForFilename(safe));
        res.setHeader('Content-Type', this.mimeForFilename(safe, downloaded.contentType));
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.send(downloaded.body);
      }
      this.logger.warn(`Upload miss local+db+supabase ${objectPath}: ${downloaded.message}`);
    }

    throw new NotFoundException('Fichier introuvable');
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
    const filename = `${id}.${ext}`;
    const photoUrl = `/api/uploads/${category}/${filename}`;
    const contentType = mimeType || 'application/octet-stream';

    let storage: 'supabase+db' | 'db' | 'local' = 'db';
    let bucket: string | undefined;
    let cloudinaryMockUrl = photoUrl;

    if (isSupabaseStorageConfigured(this.get)) {
      bucket = category === 'kyc' ? supabaseKycBucket(this.get) : supabaseUploadsBucket(this.get);
      const result = await supabaseUploadObject(this.get, {
        bucket,
        objectPath,
        body: buffer,
        contentType,
        signedUrlExpiresIn: 7 * 24 * 3600,
      });
      if (result.success) {
        storage = 'supabase+db';
        cloudinaryMockUrl = result.signedUrl ?? result.publicUrl ?? photoUrl;
      } else {
        this.logger.error(`Supabase upload failed (${category}): ${result.message}`);
        if (category === 'kyc' && this.isProduction) {
          throw new MovaHttpException(
            MovaErrorCode.INTERNAL_ERROR,
            HttpStatus.BAD_GATEWAY,
            result.message ?? 'Échec stockage document KYC.',
          );
        }
      }
    }

    // Always persist to Postgres so redeploys do not wipe partner photos.
    await this.persistDurable(category, filename, buffer, contentType);

    return {
      photoUrl,
      cloudinaryMockUrl,
      storage,
      ...(bucket ? { bucket, path: objectPath } : {}),
    };
  }

  private async persistDurable(category: UploadCategory, filename: string, buffer: Buffer, mimeType: string) {
    await this.prisma.uploadedMedia.upsert({
      where: { category_filename: { category, filename } },
      create: { category, filename, mimeType, data: buffer },
      update: { mimeType, data: buffer },
    });
    await this.recacheLocal(category, filename, buffer).catch(() => undefined);
  }

  private async recacheLocal(category: UploadCategory, filename: string, data: Buffer | Uint8Array) {
    const dir = join(process.cwd(), 'uploads', category);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), Buffer.from(data));
  }
}
