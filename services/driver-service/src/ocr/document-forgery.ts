/**
 * Signs of forgery on a KYC document photo. Claude only flags what it sees: the result is a
 * hint for the admin ("à vérifier de près"), never a proof that a document is genuine or fake.
 */

/** Documents whose photo is checked for signs of forgery. */
export const FORGERY_CHECK_TYPES = [
  'ID_PHOTO',
  'DRIVERS_LICENSE',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
  'TECHNICAL_INSPECTION',
  'FISCAL_STICKER',
] as const;

export function isForgeryCheckType(type: string): boolean {
  return (FORGERY_CHECK_TYPES as readonly string[]).includes(type);
}

const DOCUMENT_NAMES: Record<string, string> = {
  ID_PHOTO: "pièce d'identité (carte d'électeur CENI, passeport ou carte d'identité)",
  DRIVERS_LICENSE: 'permis de conduire',
  VEHICLE_REGISTRATION: 'carte grise (certificat d’immatriculation)',
  VEHICLE_INSURANCE: "attestation d'assurance du véhicule",
  TECHNICAL_INSPECTION: 'certificat de contrôle technique',
  FISCAL_STICKER: 'vignette fiscale',
};

export const FORGERY_SCHEMA = {
  type: 'object',
  properties: {
    isExpectedDocument: {
      type: 'boolean',
      description: 'La photo montre bien un document du type attendu',
    },
    photoOfScreen: { type: 'boolean', description: "Photo d'un écran (téléphone, ordinateur) plutôt que du document" },
    photocopyOrPrint: { type: 'boolean', description: 'Photocopie ou impression plutôt que le document original' },
    signs: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Signes concrets de retouche ou de falsification visibles, en français (texte collé ou décalé, polices ' +
        'différentes, zones floues ou effacées, photo du titulaire collée, couleurs ou fond incohérents, ' +
        'numéro au format inhabituel, dates impossibles, coins ou bords incohérents). Vide si rien.',
    },
    confidence: { type: 'number', description: 'Confiance dans cette analyse, de 0 à 1' },
    notes: { type: 'string', description: 'Résumé en une phrase, en français' },
  },
  required: ['isExpectedDocument', 'photoOfScreen', 'photocopyOrPrint', 'signs', 'confidence', 'notes'],
  additionalProperties: false,
} as const;

export function forgeryPrompt(type: string): string {
  return [
    `Tu aides l'équipe SENGA (VTC et livraison en RDC) à repérer les documents falsifiés. Document attendu : ${
      DOCUMENT_NAMES[type] ?? type
    }.`,
    "Examine la photo et signale uniquement ce que tu vois réellement : retouches, texte ajouté ou modifié, " +
      "incohérences de mise en page, photo d'écran, photocopie. N'invente rien et ne juge pas la personne.",
    "Une photo un peu floue, mal cadrée ou usée n'est pas un signe de falsification : ne la signale pas comme telle.",
    'Tu ne peux pas confirmer qu’un document est authentique ; dis seulement si des signes méritent une vérification.',
  ].join('\n');
}

export type ForgeryVerdict = 'RAS' | 'A_VERIFIER' | 'SUSPECT';

/** RAS (nothing seen), À VÉRIFIER, or SUSPECT (clear signs of tampering). */
export function forgeryVerdict(check: Record<string, unknown> | null): ForgeryVerdict {
  if (!check) return 'A_VERIFIER';
  const signs = Array.isArray(check.signs) ? check.signs.filter((s) => typeof s === 'string' && s.trim()) : [];
  const confidence = typeof check.confidence === 'number' ? check.confidence : 0;
  if (check.isExpectedDocument === false || signs.length >= 2) return 'SUSPECT';
  if (signs.length === 1 || check.photoOfScreen === true || check.photocopyOrPrint === true || confidence < 0.5) {
    return 'A_VERIFIER';
  }
  return 'RAS';
}

/** "A 123 456" / "a123456" → "A123456": compares identity numbers typed differently. */
export function normalizeDocumentNumber(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
