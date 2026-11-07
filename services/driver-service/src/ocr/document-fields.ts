import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CLAUDE_OCR_MODEL, type OcrImage } from './ocr-providers';

/** KYC documents whose content can pre-fill the driver onboarding form. */
export const SCANNABLE_DOCUMENT_FIELDS: Record<string, string[]> = {
  ID_PHOTO: ['firstName', 'lastName', 'idNumber', 'birthDate'],
  DRIVERS_LICENSE: ['firstName', 'lastName', 'licenseNumber', 'expiryDate', 'categories'],
  VEHICLE_REGISTRATION: ['plateNumber', 'make', 'model', 'color'],
  VEHICLE_INSURANCE: ['expiryDate'],
  TECHNICAL_INSPECTION: ['expiryDate'],
  FISCAL_STICKER: ['expiryDate'],
};

const FIELD_HINTS: Record<string, string> = {
  firstName: 'Prénom(s) du titulaire, tel qu\'écrit',
  lastName: 'Nom(s) de famille du titulaire, tel qu\'écrit',
  idNumber:
    "Numéro de la pièce d'identité. Carte d'électeur RDC : le Numéro National, écrit en haut à droite après « NN » " +
    '(sous CODE CI / NOM CI), chiffres seuls — jamais le numéro imprimé sous la photo (ex. A51060142). ' +
    'Passeport : le numéro du passeport',
  birthDate: 'Date de naissance au format YYYY-MM-DD',
  licenseNumber: 'Numéro du permis de conduire',
  expiryDate: "Date d'expiration / fin de validité au format YYYY-MM-DD",
  categories: 'Catégories du permis séparées par des virgules (ex. A, B)',
  plateNumber: "Plaque d'immatriculation",
  make: 'Marque du véhicule',
  model: 'Modèle du véhicule',
  color: 'Couleur du véhicule',
};

export function isScannableDocument(type: string): boolean {
  return type in SCANNABLE_DOCUMENT_FIELDS;
}

function schemaFor(type: string) {
  const fields = SCANNABLE_DOCUMENT_FIELDS[type] ?? [];
  const properties: Record<string, unknown> = {
    readable: { type: 'boolean', description: 'false si la photo est floue, coupée ou ne montre pas ce document' },
  };
  for (const f of fields) {
    properties[f] = { type: ['string', 'null'], description: `${FIELD_HINTS[f]} ; null si absent ou illisible` };
  }
  return { type: 'object', properties, required: ['readable', ...fields], additionalProperties: false };
}

function promptFor(type: string): string {
  return (
    `Tu lis la photo d'un document officiel d'un chauffeur en République Démocratique du Congo (type attendu : ${type}). ` +
    'Recopie uniquement ce qui est réellement écrit sur le document, sans rien deviner ni inventer. ' +
    'Si un champ est absent ou illisible, mets null. Les dates doivent être au format YYYY-MM-DD.' +
    (type === 'ID_PHOTO'
      ? " Sur une carte d'électeur de la CENI, le numéro de la pièce est le Numéro National (NN), en haut à droite."
      : '')
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep only expected, non-empty string fields; drop dates that are not YYYY-MM-DD. */
export function cleanExtractedFields(type: string, raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of SCANNABLE_DOCUMENT_FIELDS[type] ?? []) {
    const v = raw[f];
    if (typeof v !== 'string') continue;
    let value = v.trim().replace(/\s+/g, ' ');
    // Voter card: keep the National Number alone ("NN 3337 0090 005" → "33370090005").
    if (f === 'idNumber') value = value.replace(/^N\.?N\.?\s*[:°]?\s*/i, '').replace(/^(\d[\d ]+\d)$/, (m) => m.replace(/ /g, ''));
    if (!value || value.length > 80) continue;
    if ((f === 'expiryDate' || f === 'birthDate') && !ISO_DATE.test(value)) continue;
    out[f] = value;
  }
  return out;
}

/** Claude reads the document and returns the fields to pre-fill. */
export async function extractDocumentFieldsWithClaude(
  image: OcrImage,
  type: string,
): Promise<{ readable: boolean; fields: Record<string, string> }> {
  const mediaType = image.contentType.split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
    return { readable: false, fields: {} };
  }
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_OCR_MODEL,
    max_tokens: 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: { type: 'json_schema', schema: schemaFor(type) } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: image.buffer.toString('base64'),
            },
          },
          { type: 'text', text: promptFor(type) },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') return { readable: false, fields: {} };
  const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { readable: false, fields: {} };
  }
  const readable = parsed.readable !== false;
  return { readable, fields: readable ? cleanExtractedFields(type, parsed) : {} };
}
