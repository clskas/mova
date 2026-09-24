import { Injectable, Logger } from '@nestjs/common';
import { KycOcrStatus } from '@prisma/client';
import {
  compareKycOcrExpiry,
  isKycOcrEligible,
  parseKycOcrVisionResponse,
  parseSelfieIdMatchResponse,
  parseSelfieVisionResponse,
  profileExpiryFieldForKycType,
  serviceUrl,
  SELFIE_ID_MATCH_PROMPT,
  SELFIE_VISION_PROMPT,
  verifySelfieBuffer,
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

  scheduleSelfieAnalysis(documentId: string): void {
    void this.analyzeSelfieDocument(documentId).catch((err) => {
      this.logger.warn(`Selfie async failed for ${documentId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  /** Gate synchrone avant enregistrement SELFIE. */
  async verifySelfieUpload(_userId: string, url: string): Promise<{ ok: boolean; message?: string; score?: number }> {
    const fetched = await this.fetchImageBuffer(url);
    if (!fetched) {
      return { ok: false, message: 'Impossible de lire la selfie — reprenez la photo avec la caméra avant.' };
    }
    const basic = verifySelfieBuffer(fetched.buffer, { mimeType: fetched.contentType });
    if (!basic.ok) {
      return {
        ok: false,
        message: basic.reasons[0] ?? 'Selfie refusée — reprenez une photo claire de votre visage.',
        score: basic.score,
      };
    }

    const aiEnabled = process.env.AI_ENABLED === 'true';
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (aiEnabled && apiKey) {
      try {
        const dataUrl = `data:${fetched.contentType};base64,${fetched.buffer.toString('base64')}`;
        const vision = await this.callSelfieVision(apiKey, dataUrl);
        if (vision.looksLikeDocumentScan || !vision.isLiveSelfie || !vision.faceVisible) {
          return {
            ok: false,
            message:
              vision.notes ??
              'Cette photo ne semble pas être une selfie réelle. Tenez le téléphone face à vous.',
            score: vision.confidence,
          };
        }
        if (vision.confidence > 0 && vision.confidence < 0.35) {
          return {
            ok: false,
            message: 'Selfie peu convaincante — meilleure lumière, visage bien centré.',
            score: vision.confidence,
          };
        }
      } catch (err) {
        this.logger.warn(`Selfie vision skipped: ${err instanceof Error ? err.message : err}`);
      }
    }

    return { ok: true, score: basic.score, message: basic.reasons.join(' ') };
  }

  async analyzeSelfieDocument(documentId: string) {
    if (this.inFlight.has(documentId)) return null;
    this.inFlight.add(documentId);
    try {
      const doc = await this.prisma.kycDocument.findUnique({ where: { id: documentId } });
      if (!doc || doc.type !== 'SELFIE') return null;

      await this.prisma.kycDocument.update({
        where: { id: documentId },
        data: { ocrStatus: KycOcrStatus.PROCESSING },
      });

      const gate = await this.verifySelfieUpload(doc.userId, doc.url);
      if (!gate.ok) {
        return this.saveOcrResult(documentId, {
          status: KycOcrStatus.UNREADABLE,
          confidence: gate.score ?? 0,
          notes: gate.message ?? 'Selfie non valide.',
        });
      }

      const idDoc = await this.prisma.kycDocument.findFirst({
        where: { userId: doc.userId, type: 'ID_PHOTO' },
        orderBy: { createdAt: 'desc' },
      });

      const aiEnabled = process.env.AI_ENABLED === 'true';
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (idDoc?.url && aiEnabled && apiKey) {
        const selfieUrl = await this.fetchImageAsDataUrl(doc.url);
        const idUrl = await this.fetchImageAsDataUrl(idDoc.url);
        if (selfieUrl && idUrl) {
          try {
            const match = await this.callSelfieIdMatch(apiKey, selfieUrl, idUrl);
            if (!match.samePerson && match.confidence >= 0.55) {
              return this.saveOcrResult(documentId, {
                status: KycOcrStatus.MISMATCH,
                confidence: match.confidence,
                notes: match.notes ?? 'La selfie ne correspond pas à la pièce d\'identité.',
              });
            }
            return this.saveOcrResult(documentId, {
              status: match.samePerson ? KycOcrStatus.MATCH : KycOcrStatus.SKIPPED,
              confidence: match.confidence,
              notes: match.notes ?? 'Contrôle selfie / pièce d\'identité effectué.',
            });
          } catch (err) {
            this.logger.warn(`Selfie↔ID match failed: ${err instanceof Error ? err.message : err}`);
          }
        }
      }

      return this.saveOcrResult(documentId, {
        status: KycOcrStatus.MATCH,
        confidence: gate.score ?? 0.7,
        notes: gate.message ?? 'Selfie validée (contrôles anti-fraude).',
      });
    } finally {
      this.inFlight.delete(documentId);
    }
  }

  async analyzeDocument(documentId: string) {
    if (this.inFlight.has(documentId)) return null;
    this.inFlight.add(documentId);
    try {
      const doc = await this.prisma.kycDocument.findUnique({ where: { id: documentId } });
      if (!doc) return null;
      if (doc.type === 'SELFIE') {
        this.inFlight.delete(documentId);
        return this.analyzeSelfieDocument(documentId);
      }
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

  private async fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const absolute = this.resolveMediaUrl(url);
      if (!absolute) return null;
      const res = await fetch(absolute, { redirect: 'error' });
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      return { buffer, contentType };
    } catch {
      return null;
    }
  }

  private async fetchImageAsDataUrl(url: string): Promise<string | null> {
    const fetched = await this.fetchImageBuffer(url);
    if (!fetched) return null;
    return `data:${fetched.contentType};base64,${fetched.buffer.toString('base64')}`;
  }

  private async callSelfieVision(apiKey: string, dataUrl: string) {
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: SELFIE_VISION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI selfie vision ${res.status}: ${body.slice(0, 200)}`);
    }
    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseSelfieVisionResponse(payload.choices?.[0]?.message?.content ?? '');
  }

  private async callSelfieIdMatch(apiKey: string, selfieDataUrl: string, idDataUrl: string) {
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: SELFIE_ID_MATCH_PROMPT },
              { type: 'image_url', image_url: { url: selfieDataUrl } },
              { type: 'image_url', image_url: { url: idDataUrl } },
            ],
          },
        ],
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI selfie↔ID ${res.status}: ${body.slice(0, 200)}`);
    }
    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseSelfieIdMatchResponse(payload.choices?.[0]?.message?.content ?? '');
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
