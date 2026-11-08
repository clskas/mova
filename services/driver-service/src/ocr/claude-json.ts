import { aiSwitchOn } from '../common/ai-switch';
import Anthropic from '@anthropic-ai/sdk';
import type { OcrImage } from './ocr-providers';
import { DEFAULT_CLAUDE_OCR_MODEL } from './ocr-providers';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export function claudeAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return aiSwitchOn(env) && Boolean(env.ANTHROPIC_API_KEY?.trim());
}

/**
 * One Claude call with photos and a JSON schema; returns the parsed object, or null on a
 * refusal / unsupported images / unparsable answer. Throws on API errors (caller decides).
 */
export async function claudeJson(opts: {
  images: OcrImage[];
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<Record<string, unknown> | null> {
  const blocks = opts.images
    .map((img) => ({ img, type: img.contentType.split(';')[0].trim().toLowerCase() }))
    .filter((x): x is { img: OcrImage; type: ImageType } => (IMAGE_TYPES as readonly string[]).includes(x.type))
    .map(({ img, type }) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: type, data: img.buffer.toString('base64') },
    }));
  // Photos were given but none is in a supported format: nothing to read.
  if (opts.images.length > 0 && blocks.length === 0) return null;
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_OCR_MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: { type: 'json_schema', schema: opts.schema } },
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: opts.prompt }] }],
  });
  if (response.stop_reason === 'refusal') return null;
  const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const SELFIE_SCHEMA = {
  type: 'object',
  properties: {
    isLiveSelfie: { type: 'boolean' },
    faceVisible: { type: 'boolean' },
    looksLikeDocumentScan: { type: 'boolean' },
    confidence: { type: 'number' },
    notes: { type: 'string', description: 'Explication courte en français' },
  },
  required: ['isLiveSelfie', 'faceVisible', 'looksLikeDocumentScan', 'confidence', 'notes'],
  additionalProperties: false,
} as const;

const VEHICLE_TYPES = ['MOTO_TAXI', 'STANDARD', 'COMFORT', 'VIP', 'FAMILIALE', 'UTILITAIRE', 'CAMION', 'TRICYCLE', 'TRIPOTEUR', 'AUTRE'];

export const VEHICLE_PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    photosShowVehicle: { type: 'boolean', description: 'Les photos montrent bien un véhicule (pas une personne, un document, un écran…)' },
    sameVehicleOnAllPhotos: { type: 'boolean' },
    detectedType: { type: 'string', enum: VEHICLE_TYPES },
    matchesDeclaredType: { type: 'boolean' },
    plateVisible: { type: 'boolean' },
    plateText: { type: ['string', 'null'] },
    plateMatchesDeclared: { type: ['boolean', 'null'] },
    estimatedPassengerSeats: { type: ['integer', 'null'] },
    estimatedCargoVolumeM3: { type: ['number', 'null'] },
    volumePlausible: { type: ['boolean', 'null'], description: 'Volume utile déclaré plausible pour ce véhicule ; null si non applicable' },
    issues: { type: 'array', items: { type: 'string' }, description: 'Problèmes concrets, en français' },
    confidence: { type: 'number' },
    notes: { type: 'string', description: 'Résumé en une phrase, en français' },
  },
  required: [
    'photosShowVehicle',
    'sameVehicleOnAllPhotos',
    'detectedType',
    'matchesDeclaredType',
    'plateVisible',
    'plateText',
    'plateMatchesDeclared',
    'estimatedPassengerSeats',
    'estimatedCargoVolumeM3',
    'volumePlausible',
    'issues',
    'confidence',
    'notes',
  ],
  additionalProperties: false,
} as const;

export function vehiclePhotoPrompt(declared: {
  type: string;
  plateNumber?: string | null;
  make?: string | null;
  model?: string | null;
  passengerSeats?: number | null;
  cargoVolumeM3?: number | null;
}): string {
  return [
    "Tu aides l'équipe SENGA (VTC et livraison en RDC) à valider le véhicule d'un chauffeur à partir de ses photos.",
    `Déclaration du chauffeur : type ${declared.type}, plaque ${declared.plateNumber ?? 'non indiquée'}, ` +
      `${declared.make ?? ''} ${declared.model ?? ''}`.trim() +
      `, places passagers ${declared.passengerSeats ?? 'non indiquées'}, volume utile ${declared.cargoVolumeM3 ?? 'non indiqué'} m³.`,
    'Types : MOTO_TAXI (moto), STANDARD/COMFORT/VIP (berline, de plus en plus haut de gamme), FAMILIALE (6–8 places), ' +
      'UTILITAIRE (camionnette, fourgon), CAMION, TRICYCLE (tricycle à passagers), TRIPOTEUR (tricycle à benne), AUTRE.',
    "Décris seulement ce que tu vois. Ne devine pas l'identité de personnes. Signale dans issues tout écart avec la déclaration " +
      '(type, plaque, nombre de places, volume, photos floues, véhicules différents, photo non pertinente).',
  ].join('\n');
}

/** Verdict shown to the admin: OK, À VÉRIFIER or PROBLÈME. */
export function vehiclePhotoVerdict(check: Record<string, unknown> | null): 'OK' | 'A_VERIFIER' | 'PROBLEME' {
  if (!check) return 'A_VERIFIER';
  if (check.photosShowVehicle === false || check.matchesDeclaredType === false || check.plateMatchesDeclared === false) {
    return 'PROBLEME';
  }
  const issues = Array.isArray(check.issues) ? check.issues : [];
  const confidence = typeof check.confidence === 'number' ? check.confidence : 0;
  if (issues.length > 0 || confidence < 0.6 || check.volumePlausible === false || check.sameVehicleOnAllPhotos === false) {
    return 'A_VERIFIER';
  }
  return 'OK';
}
