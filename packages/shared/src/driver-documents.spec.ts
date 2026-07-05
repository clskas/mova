import { evaluateDriverDocuments, formatRentalRemaining } from './driver-documents';

describe('evaluateDriverDocuments', () => {
  const now = new Date('2026-06-16T12:00:00Z');

  it('marks driver eligible when all expiries are in the future', () => {
    const status = evaluateDriverDocuments(
      {
        licenseExpiry: '2027-01-01',
        insuranceExpiry: '2027-01-01',
        technicalInspectionExpiry: '2027-01-01',
      },
      now,
    );
    expect(status.canOperate).toBe(true);
    expect(status.expired).toHaveLength(0);
    expect(status.missing).toHaveLength(0);
  });

  it('blocks when a document is expired', () => {
    const status = evaluateDriverDocuments(
      {
        licenseExpiry: '2026-06-15',
        insuranceExpiry: '2027-01-01',
        technicalInspectionExpiry: '2027-01-01',
      },
      now,
    );
    expect(status.canOperate).toBe(false);
    expect(status.expired).toContain('license');
    expect(status.blockReason).toMatch(/Permis/);
  });

  it('treats expiry on the same day as still valid', () => {
    const status = evaluateDriverDocuments(
      {
        licenseExpiry: '2026-06-16',
        insuranceExpiry: '2026-06-16',
        technicalInspectionExpiry: '2026-06-16',
      },
      now,
    );
    expect(status.canOperate).toBe(true);
  });

  it('blocks when expiry dates are missing', () => {
    const status = evaluateDriverDocuments({ licenseExpiry: '2027-01-01' }, now);
    expect(status.canOperate).toBe(false);
    expect(status.missing).toContain('insurance');
    expect(status.missing).toContain('technicalInspection');
  });

  it('blocks operation when renewal is pending admin review', () => {
    const status = evaluateDriverDocuments(
      {
        licenseExpiry: '2027-01-01',
        insuranceExpiry: '2027-01-01',
        technicalInspectionExpiry: '2027-01-01',
        documentsRenewalPending: true,
      },
      now,
    );
    expect(status.canOperate).toBe(false);
    expect(status.blockReason).toMatch(/Renouvellement/);
  });

  it('blocks operation when vehicle type approval is pending', () => {
    const status = evaluateDriverDocuments(
      {
        licenseExpiry: '2027-01-01',
        insuranceExpiry: '2027-01-01',
        technicalInspectionExpiry: '2027-01-01',
        vehicleTypeApprovalStatus: 'PENDING',
      },
      now,
    );
    expect(status.canOperate).toBe(false);
    expect(status.blockReason).toMatch(/Type d'engin/);
  });

  it('blocks operation when vehicle type is rejected', () => {
    const status = evaluateDriverDocuments(
      {
        licenseExpiry: '2027-01-01',
        insuranceExpiry: '2027-01-01',
        technicalInspectionExpiry: '2027-01-01',
        vehicleTypeApprovalStatus: 'REJECTED',
        vehicleTypeApprovalNotes: 'Photo moto, VIP déclaré',
      },
      now,
    );
    expect(status.canOperate).toBe(false);
    expect(status.blockReason).toMatch(/Photo moto/);
  });

  it('allows operation when vehicle type is approved', () => {
    const status = evaluateDriverDocuments(
      {
        licenseExpiry: '2027-01-01',
        insuranceExpiry: '2027-01-01',
        technicalInspectionExpiry: '2027-01-01',
        vehicleTypeApprovalStatus: 'APPROVED',
      },
      now,
    );
    expect(status.canOperate).toBe(true);
  });
});

describe('formatRentalRemaining', () => {
  it('formats days remaining', () => {
    const result = formatRentalRemaining('2026-06-20T00:00:00Z', new Date('2026-06-16T12:00:00Z'));
    expect(result.isActive).toBe(true);
    expect(result.remainingDays).toBeGreaterThanOrEqual(3);
    expect(result.remainingLabel).toMatch(/jour/);
  });

  it('formats hours remaining for hourly rentals', () => {
    const end = new Date('2026-06-16T18:00:00Z');
    const now = new Date('2026-06-16T12:00:00Z');
    const result = formatRentalRemaining(end, now, { rentalPeriod: 'HOURLY' });
    expect(result.isActive).toBe(true);
    expect(result.remainingLabel).toMatch(/heure/);
    expect(result.remainingLabel).not.toMatch(/jour/);
  });

  it('formats hours when less than 24h remain on daily rental', () => {
    const end = new Date('2026-06-16T20:00:00Z');
    const now = new Date('2026-06-16T12:00:00Z');
    const result = formatRentalRemaining(end, now, { rentalPeriod: 'DAILY' });
    expect(result.isActive).toBe(true);
    expect(result.remainingLabel).toMatch(/heure/);
    expect(result.remainingLabel).not.toMatch(/jour/);
  });

  it('formats one day when between 24h and 48h remain', () => {
    const end = new Date('2026-06-17T14:00:00Z');
    const now = new Date('2026-06-16T12:00:00Z');
    const result = formatRentalRemaining(end, now, { rentalPeriod: 'DAILY' });
    expect(result.remainingLabel).toMatch(/1 jour/);
  });

  it('returns terminated label when past end date', () => {
    const result = formatRentalRemaining('2026-06-10T00:00:00Z', new Date('2026-06-16T12:00:00Z'));
    expect(result.isActive).toBe(false);
    expect(result.remainingLabel).toBe('Location terminée');
  });
});
