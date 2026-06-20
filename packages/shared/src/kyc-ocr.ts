import { KYC_DOCUMENT_TYPES, type KycDocumentType } from './kyc-documents';

/** Documents dont l'OCR extrait une date d'expiration. */
export const KYC_OCR_ELIGIBLE_TYPES: KycDocumentType[] = [
  KYC_DOCUMENT_TYPES.DRIVERS_LICENSE,
  KYC_DOCUMENT_TYPES.VEHICLE_INSURANCE,
  KYC_DOCUMENT_TYPES.TECHNICAL_INSPECTION,
];

export type KycOcrStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'MATCH'
  | 'MISMATCH'
  | 'UNREADABLE'
  | 'SKIPPED';

export type ProfileExpiryField = 'licenseExpiry' | 'insuranceExpiry' | 'technicalInspectionExpiry';

export function isKycOcrEligible(type: string): boolean {
  return (KYC_OCR_ELIGIBLE_TYPES as string[]).includes(type);
}

export function profileExpiryFieldForKycType(type: string): ProfileExpiryField | null {
  switch (type) {
    case KYC_DOCUMENT_TYPES.DRIVERS_LICENSE:
      return 'licenseExpiry';
    case KYC_DOCUMENT_TYPES.VEHICLE_INSURANCE:
      return 'insuranceExpiry';
    case KYC_DOCUMENT_TYPES.TECHNICAL_INSPECTION:
      return 'technicalInspectionExpiry';
    default:
      return null;
  }
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  janv: 0,
  fevrier: 1,
  février: 1,
  fev: 1,
  fév: 1,
  mars: 2,
  avril: 3,
  avr: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  juil: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  sept: 8,
  octobre: 9,
  oct: 9,
  novembre: 10,
  nov: 10,
  decembre: 11,
  décembre: 11,
  dec: 11,
  déc: 11,
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function sameCalendarDayUtc(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function parseIsoDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pushUniqueDate(dates: Date[], candidate: Date): void {
  if (Number.isNaN(candidate.getTime())) return;
  const key = candidate.toISOString().slice(0, 10);
  if (!dates.some((d) => d.toISOString().slice(0, 10) === key)) {
    dates.push(candidate);
  }
}

function parseDmy(day: number, month: number, year: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** Extrait les dates candidates depuis un texte OCR (FR / formats courants RDC). */
export function extractExpiryDatesFromText(text: string): Date[] {
  const dates: Date[] = [];
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();

  const dmyRegex = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
  let match: RegExpExecArray | null;
  while ((match = dmyRegex.exec(normalized)) !== null) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const d = parseDmy(day, month, year);
    if (d) pushUniqueDate(dates, d);
  }

  const ymdRegex = /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g;
  while ((match = ymdRegex.exec(normalized)) !== null) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const d = parseDmy(day, month, year);
    if (d) pushUniqueDate(dates, d);
  }

  const frenchRegex =
    /\b(\d{1,2})\s+(janvier|janv|février|fevrier|fev|fév|mars|avril|avr|mai|juin|juillet|juil|août|aout|septembre|sept|octobre|oct|novembre|nov|décembre|decembre|dec|déc)\s+(\d{4})\b/gi;
  while ((match = frenchRegex.exec(normalized)) !== null) {
    const day = Number(match[1]);
    const monthKey = match[2].toLowerCase();
    const year = Number(match[3]);
    const month = FRENCH_MONTHS[monthKey];
    if (month === undefined) continue;
    const d = new Date(Date.UTC(year, month, day));
    pushUniqueDate(dates, d);
  }

  return dates;
}

/** Choisit la date d'expiration la plus plausible parmi les candidates. */
export function pickExpiryDateFromCandidates(dates: Date[], hint?: Date | null): Date | null {
  if (!dates.length) return null;
  const today = startOfUtcDay(new Date());
  const future = dates.filter((d) => startOfUtcDay(d) >= today);
  const pool = future.length ? future : dates;

  if (hint) {
    const hintDay = startOfUtcDay(hint);
    return pool.reduce((best, d) => {
      const diff = Math.abs(startOfUtcDay(d).getTime() - hintDay.getTime());
      const bestDiff = Math.abs(startOfUtcDay(best).getTime() - hintDay.getTime());
      return diff < bestDiff ? d : best;
    });
  }

  return pool.reduce((latest, d) => (d.getTime() > latest.getTime() ? d : latest));
}

export function formatDateFr(date: Date): string {
  return date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

export function compareKycOcrExpiry(
  ocrDate: Date | null,
  profileDate: Date | null,
): { status: 'MATCH' | 'MISMATCH' | 'UNREADABLE'; notes?: string } {
  if (!ocrDate) {
    return { status: 'UNREADABLE', notes: 'Aucune date d\'expiration détectée sur le document.' };
  }
  if (!profileDate) {
    return {
      status: 'MISMATCH',
      notes: `OCR : ${formatDateFr(ocrDate)} — aucune date saisie dans le profil.`,
    };
  }
  if (sameCalendarDayUtc(ocrDate, profileDate)) {
    return { status: 'MATCH', notes: `Date conforme (${formatDateFr(ocrDate)}).` };
  }
  return {
    status: 'MISMATCH',
    notes: `OCR : ${formatDateFr(ocrDate)} · Profil : ${formatDateFr(profileDate)}`,
  };
}

export type KycOcrVisionResult = {
  expiryDate: Date | null;
  confidence: number | null;
  rawText?: string;
  notes?: string;
};

/** Parse la réponse JSON/texte d'un modèle vision. */
export function parseKycOcrVisionResponse(content: string, hint?: Date | null): KycOcrVisionResult {
  let parsed: Record<string, unknown> | null = null;
  const trimmed = content.trim();
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
  }

  let expiryDate: Date | null = null;
  let confidence: number | null = null;
  let notes: string | undefined;
  let rawText = trimmed;

  if (parsed) {
    expiryDate = parseIsoDate(parsed.expiryDate ?? parsed.expirationDate ?? parsed.date);
    if (parsed.confidence != null) {
      const c = Number(parsed.confidence);
      confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : null;
    }
    if (typeof parsed.notes === 'string') notes = parsed.notes;
    if (typeof parsed.rawText === 'string') rawText = parsed.rawText;
  }

  if (!expiryDate) {
    const candidates = extractExpiryDatesFromText(rawText);
    expiryDate = pickExpiryDateFromCandidates(candidates, hint);
  }

  return { expiryDate, confidence, rawText, notes };
}
