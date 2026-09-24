/**
 * Heuristics + optional vision prompts to verify a driver selfie is a real
 * live portrait (not a blank image, screenshot collage, or document scan).
 */

export type SelfieVerifyResult = {
  ok: boolean;
  score: number;
  reasons: string[];
};

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === JPEG_SOI[0] && buf[1] === JPEG_SOI[1];
}

function isPng(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(PNG_SIG);
}

/** Sample luminance variance in the center third — faces have texture; blank/selfie-of-document often don't. */
function centerLuminanceVariance(buf: Buffer): number {
  // Lightweight: sample every Nth byte as a proxy for texture (works for JPEG entropy).
  const start = Math.floor(buf.length * 0.25);
  const end = Math.floor(buf.length * 0.75);
  if (end - start < 64) return 0;
  const step = Math.max(1, Math.floor((end - start) / 400));
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = start; i < end; i += step) {
    const v = buf[i]!;
    sum += v;
    sumSq += v * v;
    n += 1;
  }
  if (n < 8) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Fast local checks before / without AI vision.
 * Rejects tiny, empty, non-image, or suspiciously uniform payloads.
 */
export function verifySelfieBuffer(buf: Buffer, opts?: { mimeType?: string; minBytes?: number }): SelfieVerifyResult {
  const reasons: string[] = [];
  let score = 1;

  const minBytes = opts?.minBytes ?? 8_000;
  if (!buf?.length) {
    return { ok: false, score: 0, reasons: ['Image vide.'] };
  }
  if (buf.length < minBytes) {
    reasons.push('Selfie trop compressé ou trop petit — reprenez la photo face à la caméra.');
    score -= 0.5;
  }
  if (buf.length > 5 * 1024 * 1024) {
    reasons.push('Fichier trop volumineux (max 5 Mo).');
    score -= 0.4;
  }

  const mime = (opts?.mimeType ?? '').toLowerCase();
  const looksJpeg = isJpeg(buf) || mime.includes('jpeg') || mime.includes('jpg');
  const looksPng = isPng(buf) || mime.includes('png');
  if (!looksJpeg && !looksPng) {
    reasons.push('Format non supporté — utilisez la caméra du téléphone (JPEG).');
    score -= 0.6;
  }

  const variance = centerLuminanceVariance(buf);
  // Near-zero variance ≈ solid color / corrupted; very low entropy often = fake screenshot of ID.
  if (variance < 80) {
    reasons.push('La photo semble artificielle ou floue — tenez le téléphone face à vous, bonne lumière.');
    score -= 0.35;
  } else if (variance < 200) {
    score -= 0.1;
    reasons.push('Contraste faible — améliorez l\'éclairage.');
  }

  // JPEG entropy proxy: ratio of unique bytes in a sample
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  const unique = new Set(sample).size;
  if (unique < 24) {
    reasons.push('Image trop uniforme — ce n\'est pas une selfie utilisable.');
    score -= 0.4;
  }

  const ok = score >= 0.45 && !reasons.some((r) => /vide|Format non|trop petit|trop volumineux|uniforme/i.test(r));
  if (ok && reasons.length === 0) {
    reasons.push('Contrôles basiques OK.');
  }
  return { ok, score: Math.max(0, Math.min(1, score)), reasons };
}

/** Prompt for OpenAI vision when AI_ENABLED — live face selfie check (+ optional ID match). */
export const SELFIE_VISION_PROMPT = `Tu vérifies qu'une photo est une SELFIE authentique d'une personne réelle (inscription chauffeur SENGA, RDC).

Critères OBLIGATOIRES pour accepter :
- Un seul visage humain net, de face ou 3/4, occupant une part visible du cadre
- Photo prise récemment avec un téléphone (pas un scan de pièce d'identité, pas une photocopie, pas un écran photographié)
- Pas de masque opaque couvrant tout le visage, pas de photo de groupe

Réponds en JSON strict :
{"isLiveSelfie":true|false,"faceVisible":true|false,"looksLikeDocumentScan":true|false,"confidence":0.0-1.0,"notes":"explication courte en français"}`;

export const SELFIE_ID_MATCH_PROMPT = `Compare la selfie (image 1) et la pièce d'identité (image 2).
Est-ce la même personne ?
Réponds en JSON strict :
{"samePerson":true|false,"confidence":0.0-1.0,"notes":"explication courte en français"}`;

export type SelfieVisionParsed = {
  isLiveSelfie: boolean;
  faceVisible: boolean;
  looksLikeDocumentScan: boolean;
  confidence: number;
  notes?: string;
};

export function parseSelfieVisionResponse(raw: string): SelfieVisionParsed {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Record<string, unknown>;
    return {
      isLiveSelfie: obj.isLiveSelfie === true,
      faceVisible: obj.faceVisible === true,
      looksLikeDocumentScan: obj.looksLikeDocumentScan === true,
      confidence: typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence) || 0,
      notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    };
  } catch {
    return {
      isLiveSelfie: false,
      faceVisible: false,
      looksLikeDocumentScan: false,
      confidence: 0,
      notes: 'Réponse vision illisible.',
    };
  }
}

export type SelfieIdMatchParsed = {
  samePerson: boolean;
  confidence: number;
  notes?: string;
};

export function parseSelfieIdMatchResponse(raw: string): SelfieIdMatchParsed {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Record<string, unknown>;
    return {
      samePerson: obj.samePerson === true,
      confidence: typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence) || 0,
      notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    };
  } catch {
    return { samePerson: false, confidence: 0, notes: 'Réponse vision illisible.' };
  }
}
