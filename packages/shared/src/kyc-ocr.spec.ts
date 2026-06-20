import {
  compareKycOcrExpiry,
  extractExpiryDatesFromText,
  parseKycOcrVisionResponse,
  pickExpiryDateFromCandidates,
  sameCalendarDayUtc,
} from './kyc-ocr';

describe('kyc-ocr', () => {
  it('extracts DD/MM/YYYY and French month dates', () => {
    const dates = extractExpiryDatesFromText(
      'Permis valable jusqu\'au 15/08/2027. Date d\'expiration : 31 décembre 2028',
    );
    expect(dates).toHaveLength(2);
    expect(dates[0].toISOString().slice(0, 10)).toBe('2027-08-15');
    expect(dates[1].toISOString().slice(0, 10)).toBe('2028-12-31');
  });

  it('picks closest date to profile hint', () => {
    const hint = new Date('2027-08-15T00:00:00.000Z');
    const picked = pickExpiryDateFromCandidates(
      [new Date('2026-01-01'), new Date('2027-08-16'), new Date('2029-01-01')],
      hint,
    );
    expect(picked?.toISOString().slice(0, 10)).toBe('2027-08-16');
  });

  it('compares OCR and profile dates', () => {
    const ocr = new Date('2027-08-15T00:00:00.000Z');
    const profile = new Date('2027-08-15T12:00:00.000Z');
    expect(compareKycOcrExpiry(ocr, profile).status).toBe('MATCH');
    expect(compareKycOcrExpiry(ocr, new Date('2030-01-01')).status).toBe('MISMATCH');
    expect(compareKycOcrExpiry(null, profile).status).toBe('UNREADABLE');
  });

  it('parses vision JSON response', () => {
    const result = parseKycOcrVisionResponse(
      '{"expiryDate":"2027-08-15","confidence":0.92,"notes":"Date lisible"}',
    );
    expect(result.expiryDate?.toISOString().slice(0, 10)).toBe('2027-08-15');
    expect(result.confidence).toBe(0.92);
  });

  it('falls back to regex when JSON has no date', () => {
    const result = parseKycOcrVisionResponse('Expiration le 20/06/2026 sur le document.');
    expect(result.expiryDate?.toISOString().slice(0, 10)).toBe('2026-06-20');
  });

  it('sameCalendarDayUtc ignores time', () => {
    const a = new Date('2027-08-15T00:00:00.000Z');
    const b = new Date('2027-08-15T23:59:00.000Z');
    expect(sameCalendarDayUtc(a, b)).toBe(true);
  });
});
