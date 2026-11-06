import Anthropic from '@anthropic-ai/sdk';
import { GoogleAuth } from 'google-auth-library';
import {
  extractExpiryDatesFromText,
  parseKycOcrVisionResponse,
  pickExpiryDateFromCandidates,
} from '@mova/shared';

/** Engines that can read the expiry date of a KYC document. */
export type OcrProviderName = 'claude' | 'documentai' | 'openai';

export type OcrProviderReading = {
  expiryDate: Date | null;
  confidence: number | null;
  notes?: string;
};

export type OcrImage = { buffer: Buffer; contentType: string };

/** Default Claude model for KYC reading; override with ANTHROPIC_MODEL. */
export const DEFAULT_CLAUDE_OCR_MODEL = 'claude-opus-5-5';

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];

const EXPIRY_SCHEMA = {
  type: 'object',
  properties: {
    expiryDate: {
      type: ['string', 'null'],
      description: "Date d'expiration au format YYYY-MM-DD, ou null si illisible ou absente",
    },
    confidence: { type: 'number', description: 'Confiance entre 0 et 1' },
    notes: { type: 'string', description: 'Courte explication en français' },
  },
  required: ['expiryDate', 'confidence', 'notes'],
  additionalProperties: false,
} as const;

/**
 * Which engines run. OCR_PROVIDERS (e.g. "claude,documentai") wins; otherwise every
 * engine whose credentials are present. Unconfigured engines are always skipped.
 */
export function configuredOcrProviders(env: NodeJS.ProcessEnv = process.env): OcrProviderName[] {
  const available: Record<OcrProviderName, boolean> = {
    claude: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    documentai: Boolean(
      env.GOOGLE_DOCUMENT_AI_CREDENTIALS?.trim() &&
        env.GOOGLE_DOCUMENT_AI_PROJECT_ID?.trim() &&
        env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim(),
    ),
    openai: Boolean(env.OPENAI_API_KEY?.trim()),
  };
  const wanted = env.OCR_PROVIDERS?.trim()
    ? env.OCR_PROVIDERS.split(',').map((p) => p.trim().toLowerCase())
    : (['claude', 'documentai', 'openai'] as string[]);
  return wanted.filter((p): p is OcrProviderName => p in available && available[p as OcrProviderName]);
}

/** Claude reads the photo and answers with a JSON object (structured output). */
export async function readExpiryWithClaude(image: OcrImage, prompt: string): Promise<OcrProviderReading> {
  const mediaType = image.contentType.split(';')[0].trim().toLowerCase();
  if (!(CLAUDE_IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    return { expiryDate: null, confidence: null, notes: `Format d'image non pris en charge par Claude (${mediaType}).` };
  }
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_OCR_MODEL,
    max_tokens: 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: { type: 'json_schema', schema: EXPIRY_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as ClaudeImageType, data: image.buffer.toString('base64') },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') {
    return { expiryDate: null, confidence: null, notes: 'Claude a refusé de lire ce document.' };
  }
  const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  // No hint: the reading must stay independent of the date the driver declared.
  const parsed = parseKycOcrVisionResponse(text, null);
  return { expiryDate: parsed.expiryDate, confidence: parsed.confidence, notes: parsed.notes };
}

/** Text that follows an expiry keyword, where the expiry date usually sits. */
function textAfterExpiryKeyword(text: string): string | null {
  const m = text
    .replace(/\s+/g, ' ')
    .match(/(expir\w*|valable jusqu\w*|validit\w*|date de fin|échéance|echeance|valid until|expiry)(.{0,60})/i);
  return m ? m[2] : null;
}

/** Pick the expiry date from raw OCR text (Document AI only returns text). */
export function expiryFromOcrText(text: string): OcrProviderReading {
  if (!text.trim()) return { expiryDate: null, confidence: 0, notes: 'Aucun texte détecté sur le document.' };
  const near = textAfterExpiryKeyword(text);
  const nearDates = near ? extractExpiryDatesFromText(near) : [];
  if (nearDates.length > 0) {
    return { expiryDate: nearDates[0], confidence: 0.8, notes: "Date lue à côté de la mention d'expiration." };
  }
  const all = extractExpiryDatesFromText(text);
  const picked = pickExpiryDateFromCandidates(all, null);
  if (!picked) return { expiryDate: null, confidence: 0.1, notes: 'Aucune date lisible dans le texte du document.' };
  return {
    expiryDate: picked,
    confidence: all.length === 1 ? 0.6 : 0.4,
    notes: all.length === 1 ? 'Seule date trouvée sur le document.' : `Date la plus tardive parmi ${all.length} dates trouvées.`,
  };
}

/** Google Document AI (Document OCR processor) returns the text; the date is picked from it. */
export async function readExpiryWithDocumentAi(image: OcrImage): Promise<OcrProviderReading> {
  const credentials = JSON.parse(process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS ?? '{}') as Record<string, unknown>;
  const project = process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID!.trim();
  const processor = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID!.trim();
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() || 'eu';
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const url = `https://${location}-documentai.googleapis.com/v1/projects/${project}/locations/${location}/processors/${processor}:process`;
  const res = await client.request<{ document?: { text?: string } }>({
    url,
    method: 'POST',
    data: {
      rawDocument: { content: image.buffer.toString('base64'), mimeType: image.contentType.split(';')[0].trim() },
    },
    timeout: 30_000,
  });
  return expiryFromOcrText(res.data.document?.text ?? '');
}
