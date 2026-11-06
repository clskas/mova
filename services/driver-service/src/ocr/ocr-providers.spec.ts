import { configuredOcrProviders, expiryFromOcrText } from './ocr-providers';

describe('configuredOcrProviders', () => {
  const docAi = {
    GOOGLE_DOCUMENT_AI_CREDENTIALS: '{"type":"service_account"}',
    GOOGLE_DOCUMENT_AI_PROJECT_ID: 'senga-kyc',
    GOOGLE_DOCUMENT_AI_PROCESSOR_ID: 'abc123',
  };

  it('runs every engine whose credentials are set', () => {
    expect(configuredOcrProviders({ ANTHROPIC_API_KEY: 'k', ...docAi })).toEqual(['claude', 'documentai']);
    expect(configuredOcrProviders({})).toEqual([]);
  });

  it('ignores Document AI without its project and processor', () => {
    expect(configuredOcrProviders({ GOOGLE_DOCUMENT_AI_CREDENTIALS: '{}' })).toEqual([]);
  });

  it('follows OCR_PROVIDERS to turn an engine off', () => {
    expect(configuredOcrProviders({ ANTHROPIC_API_KEY: 'k', ...docAi, OCR_PROVIDERS: 'claude' })).toEqual(['claude']);
    expect(configuredOcrProviders({ ...docAi, OCR_PROVIDERS: 'documentai,claude' })).toEqual(['documentai']);
  });
});

describe('expiryFromOcrText (Document AI text)', () => {
  it('reads the date next to the expiry wording', () => {
    const r = expiryFromOcrText('PERMIS DE CONDUIRE Délivré le 12/03/2020 Date d\'expiration : 11/03/2030 Catégorie B');
    expect(r.expiryDate?.toISOString().slice(0, 10)).toBe('2030-03-11');
    expect(r.confidence).toBe(0.8);
  });

  it('falls back to the latest date when there is no wording', () => {
    const r = expiryFromOcrText('ASSURANCE 01/01/2026 31/12/2099');
    expect(r.expiryDate?.toISOString().slice(0, 10)).toBe('2099-12-31');
    expect(r.confidence).toBe(0.4);
  });

  it('reports an empty or dateless text', () => {
    expect(expiryFromOcrText('   ').expiryDate).toBeNull();
    expect(expiryFromOcrText('SOCIETE GENERALE ASSURANCES').expiryDate).toBeNull();
  });
});
