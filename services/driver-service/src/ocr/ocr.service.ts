import { Injectable, Logger } from '@nestjs/common';
import { KycOcrStatus } from '@prisma/client';
import {
  compareKycOcrExpiry,
  isKycOcrEligible,
  parseKycOcrVisionResponse,
  profileExpiryFieldForKycType,
  serviceUrl,
  type KycOcrStatus as SharedKycOcrStatus,
} from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hostnameFromUrl, parseAllowedOcrMediaUrl } from './ocr-media-url';

const OCR_VISION_PROMPT = `Tu analyses une photo de document officiel (permis de conduire, assurance véhicule ou visite technique) en République Démocratique du Congo.

Extrais UNIQUEMENT la date d'expiration la plus pertinente du document.
Réponds en JSON strict :
{"expiryDate":"YYYY-MM-DD ou null","confidence":0.0-1.0,"notes":"courte explication en français"}

Si la date est illisible ou absente, mets expiryDate à null et confidence basse.`;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly inFlight = new Set<string>();

  constructor(private prisma: PrismaService) {}

  scheduleAnalysis(documentId: string): void {
    void this.analyzeDocument(documentId).catch((err) => {
      this.logger.warn(`OCR async failed for ${documentId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  async analyzeDocument(documentId: string) {
    if (this.inFlight.has(documentId)) return null;
    this.inFlight.add(documentId);
    try {
      const doc = await this.prisma.kycDocument.findUnique({ where: { id: documentId } });
      if (!doc) return null;
      if (!isKycOcrEligible(doc.type)) {
        return this.saveOcrResult(documentId, {
          status: KycOcrStatus.SKIPPED,
          notes: 'Type de document non éligible à l\'OCR.',
        });
      }

      await this.prisma.kycDocument.update({
        where: { id: documentId },
        data: { ocrStatus: KycOcrStatus.PROCESSING },
      });

      const profile = await this.prisma.driverProfile.findUnique({ where: { userId: doc.userId } });
      const field = profileExpiryFieldForKycType(doc.type);
      const profileExpiry =
        field && profile
          ? (profile[field] as Date | null | undefined) ?? null
          : null;

      const aiEnabled = process.env.AI_ENABLED === 'true';
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!aiEnabled || !apiKey) {
        return this.saveOcrResult(documentId, {
          status: KycOcrStatus.SKIPPED,
          profileExpiry,
          notes: 'OCR désactivé — définir AI_ENABLED=true et OPENAI_API_KEY dans config/external-apis.env.',
        });
      }

      const imageDataUrl = await this.fetchImageAsDataUrl(doc.url);
      if (!imageDataUrl) {
        return this.saveOcrResult(documentId, {
          status: KycOcrStatus.UNREADABLE,
          profileExpiry,
          notes: 'Impossible de charger l\'image du document.',
        });
      }

      const vision = await this.callOpenAiVision(apiKey, imageDataUrl, profileExpiry);
      const comparison = compareKycOcrExpiry(vision.expiryDate, profileExpiry);
      const status = this.toPrismaOcrStatus(comparison.status);

      return this.saveOcrResult(documentId, {
        status,
        extractedExpiry: vision.expiryDate,
        profileExpiry,
        confidence: vision.confidence,
        notes: vision.notes ?? comparison.notes,
      });
    } finally {
      this.inFlight.delete(documentId);
    }
  }

  private toPrismaOcrStatus(status: SharedKycOcrStatus): KycOcrStatus {
    if (status === 'MATCH') return KycOcrStatus.MATCH;
    if (status === 'MISMATCH') return KycOcrStatus.MISMATCH;
    return KycOcrStatus.UNREADABLE;
  }

  private gatewayHosts(): string[] {
    const hosts = [
      hostnameFromUrl(process.env.GATEWAY_SERVICE_URL),
      hostnameFromUrl(process.env.GATEWAY_URL),
      hostnameFromUrl(serviceUrl('gateway')),
    ].filter((host): host is string => Boolean(host));
    return [...new Set(hosts)];
  }

  private resolveMediaUrl(url: string): string | null {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return parseAllowedOcrMediaUrl(trimmed, this.gatewayHosts()) ? trimmed : null;
    }
    const gatewayBase =
      process.env.GATEWAY_SERVICE_URL?.replace(/\/$/, '') ??
      process.env.GATEWAY_URL?.replace(/\/$/, '') ??
      serviceUrl('gateway');
    const path = trimmed.startsWith('/api/') ? trimmed : `/api${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
    return `${gatewayBase}${path}`;
  }

  private async fetchImageAsDataUrl(url: string): Promise<string | null> {
    try {
      const absolute = this.resolveMediaUrl(url);
      if (!absolute) {
        this.logger.warn('OCR image URL rejected (host not allowlisted)');
        return null;
      }
      const res = await fetch(absolute, { redirect: 'error' });
      if (!res.ok) {
        this.logger.warn(`Image fetch ${res.status} for ${absolute}`);
        return null;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (err) {
      this.logger.warn(`Image fetch error: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  private async callOpenAiVision(
    apiKey: string,
    dataUrl: string,
    hint: Date | null,
  ): Promise<{ expiryDate: Date | null; confidence: number | null; notes?: string }> {
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: OCR_VISION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI Vision ${res.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? '';
    const parsed = parseKycOcrVisionResponse(content, hint);
    return {
      expiryDate: parsed.expiryDate,
      confidence: parsed.confidence,
      notes: parsed.notes,
    };
  }

  private saveOcrResult(
    documentId: string,
    data: {
      status: KycOcrStatus;
      extractedExpiry?: Date | null;
      profileExpiry?: Date | null;
      confidence?: number | null;
      notes?: string;
    },
  ) {
    return this.prisma.kycDocument.update({
      where: { id: documentId },
      data: {
        ocrStatus: data.status,
        ocrExtractedExpiry: data.extractedExpiry ?? null,
        ocrProfileExpiry: data.profileExpiry ?? null,
        ocrConfidence: data.confidence ?? null,
        ocrNotes: data.notes ?? null,
        ocrCheckedAt: new Date(),
      },
    });
  }
}
