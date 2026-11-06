import { cleanExtractedFields, isScannableDocument } from './document-fields';

describe('document fields (onboarding pre-fill)', () => {
  it('knows which documents can pre-fill the form', () => {
    expect(isScannableDocument('DRIVERS_LICENSE')).toBe(true);
    expect(isScannableDocument('SELFIE')).toBe(false);
  });

  it('keeps only expected, clean fields and valid dates', () => {
    const out = cleanExtractedFields('DRIVERS_LICENSE', {
      firstName: '  Jean  Pierre ',
      lastName: 'KABILA',
      licenseNumber: 'KIN-123',
      expiryDate: '11/03/2030',
      categories: null,
      plateNumber: 'CD-1',
    });
    expect(out).toEqual({ firstName: 'Jean Pierre', lastName: 'KABILA', licenseNumber: 'KIN-123' });
  });

  it('accepts ISO dates', () => {
    expect(cleanExtractedFields('VEHICLE_INSURANCE', { expiryDate: '2027-05-31' })).toEqual({ expiryDate: '2027-05-31' });
  });
});
