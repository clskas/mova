import { forgeryVerdict, isForgeryCheckType, normalizeDocumentNumber } from './document-forgery';

describe('document forgery signs', () => {
  const clean = { isExpectedDocument: true, photoOfScreen: false, photocopyOrPrint: false, signs: [], confidence: 0.9 };

  it('says nothing to report when nothing is seen', () => {
    expect(forgeryVerdict(clean)).toBe('RAS');
  });

  it('asks a closer look for one sign, a screen photo or a photocopy', () => {
    expect(forgeryVerdict({ ...clean, signs: ['Police différente sur le numéro'] })).toBe('A_VERIFIER');
    expect(forgeryVerdict({ ...clean, photoOfScreen: true })).toBe('A_VERIFIER');
    expect(forgeryVerdict({ ...clean, photocopyOrPrint: true })).toBe('A_VERIFIER');
    expect(forgeryVerdict({ ...clean, confidence: 0.3 })).toBe('A_VERIFIER');
    expect(forgeryVerdict(null)).toBe('A_VERIFIER');
  });

  it('flags as suspect several signs or the wrong document', () => {
    expect(forgeryVerdict({ ...clean, signs: ['Texte collé', 'Photo du titulaire collée'] })).toBe('SUSPECT');
    expect(forgeryVerdict({ ...clean, isExpectedDocument: false })).toBe('SUSPECT');
  });

  it('checks identity, licence and vehicle papers, not the selfie', () => {
    expect(isForgeryCheckType('ID_PHOTO')).toBe(true);
    expect(isForgeryCheckType('VEHICLE_REGISTRATION')).toBe(true);
    expect(isForgeryCheckType('SELFIE')).toBe(false);
  });

  it('compares numbers typed with or without spaces', () => {
    expect(normalizeDocumentNumber(' 3337 0090-005 ')).toBe(normalizeDocumentNumber('33370090005'));
    expect(normalizeDocumentNumber('op 012 345')).toBe('OP012345');
    expect(normalizeDocumentNumber(null)).toBe('');
  });
});
