import {
  normalizeKycRejectNotes,
  restaurantKycTypes,
  rentalKycTypes,
  REQUIRED_RESTAURANT_KYC_TYPES,
  PARTNER_KYC_DOCUMENT_TYPES,
} from './kyc-documents';

describe('partner KYC checklists', () => {
  it('exige identité, RCCM et photos du local pour un restaurant', () => {
    const required = restaurantKycTypes().filter((t) => t.required).map((t) => t.type);
    expect(required).toEqual(REQUIRED_RESTAURANT_KYC_TYPES);
    expect(required).toContain(PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID);
    expect(required).toContain(PARTNER_KYC_DOCUMENT_TYPES.RCCM);
    expect(required).toContain(PARTNER_KYC_DOCUMENT_TYPES.PREMISES_PHOTO);
  });

  it('distingue loueur entreprise et individuel', () => {
    const company = rentalKycTypes('COMPANY').filter((t) => t.required).map((t) => t.type);
    const individual = rentalKycTypes('INDIVIDUAL').filter((t) => t.required).map((t) => t.type);
    expect(company).toContain(PARTNER_KYC_DOCUMENT_TYPES.RCCM);
    expect(company).toContain(PARTNER_KYC_DOCUMENT_TYPES.COMPANY_STATUTES);
    expect(individual).toEqual(['ID_PHOTO']);
  });
});

describe('normalizeKycRejectNotes', () => {
  it('exige un motif français pour un refus', () => {
    expect(() => normalizeKycRejectNotes(false, '')).toThrow(/motif du refus/);
    expect(() => normalizeKycRejectNotes(false, 'court')).toThrow(/motif du refus/);
    expect(normalizeKycRejectNotes(false, 'Photo floue, recommencer')).toBe('Photo floue, recommencer');
  });

  it('laisse le motif optionnel lors d\'une approbation', () => {
    expect(normalizeKycRejectNotes(true)).toBeUndefined();
    expect(normalizeKycRejectNotes(true, '  ok  ')).toBe('ok');
  });
});
