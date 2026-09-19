import {
  normalizeKycRejectNotes,
  allPartnerJustificatifsApproved,
  allDriverJustificatifsApproved,
  restaurantKycTypes,
  rentalKycTypes,
  checklistSatisfiesJobsGate,
  JOBS_GATE_RESTAURANT_KYC_TYPES,
  JOBS_GATE_RENTAL_COMPANY_KYC_TYPES,
  PARTNER_KYC_DOCUMENT_TYPES,
  kycDocumentLabel,
  kycPartnerKindLabel,
  rentalKycPartnerKind,
  kycRejectNotifyCopy,
  driverActivationPinNotifyCopy,
  resolveJobsGateTypes,
  buildDocumentsReminder,
  documentsGraceElapsed,
} from './kyc-documents';

describe('partner KYC checklists', () => {
  it('laisse tous les justificatifs restaurant optionnels à l\'activation', () => {
    const required = restaurantKycTypes().filter((t) => t.required).map((t) => t.type);
    const optional = restaurantKycTypes().filter((t) => !t.required).map((t) => t.type);
    expect(required).toEqual([]);
    expect(optional).toContain(PARTNER_KYC_DOCUMENT_TYPES.MANAGER_ID);
    expect(optional).toContain(PARTNER_KYC_DOCUMENT_TYPES.RCCM);
    expect(optional).toContain(PARTNER_KYC_DOCUMENT_TYPES.PREMISES_PHOTO);
  });

  it('distingue loueur entreprise et individuel (tous optionnels)', () => {
    const companyRequired = rentalKycTypes('COMPANY').filter((t) => t.required).map((t) => t.type);
    const individualRequired = rentalKycTypes('INDIVIDUAL').filter((t) => t.required).map((t) => t.type);
    const companyOptional = rentalKycTypes('COMPANY').filter((t) => !t.required).map((t) => t.type);
    expect(companyRequired).toEqual([]);
    expect(individualRequired).toEqual([]);
    expect(companyOptional).toContain(PARTNER_KYC_DOCUMENT_TYPES.RCCM);
    expect(companyOptional).toContain(PARTNER_KYC_DOCUMENT_TYPES.COMPANY_STATUTES);
    expect(rentalKycTypes('INDIVIDUAL').map((t) => t.type)).toContain('ID_PHOTO');
  });

  it('exige les types jobs-gate quand l\'admin active la règle documents', () => {
    expect(
      checklistSatisfiesJobsGate(
        [
          { type: 'MANAGER_ID', uploaded: true, status: 'APPROVED' },
          { type: 'RCCM', uploaded: true, status: 'APPROVED' },
          { type: 'PREMISES_PHOTO', uploaded: true, status: 'APPROVED' },
        ],
        JOBS_GATE_RESTAURANT_KYC_TYPES,
      ),
    ).toBe(true);
    expect(
      checklistSatisfiesJobsGate(
        [{ type: 'MANAGER_ID', uploaded: true, status: 'APPROVED' }],
        JOBS_GATE_RESTAURANT_KYC_TYPES,
      ),
    ).toBe(false);
    expect(JOBS_GATE_RENTAL_COMPANY_KYC_TYPES).toContain(PARTNER_KYC_DOCUMENT_TYPES.RCCM);
  });

  it('utilise la liste admin personnalisée pour le gate jobs et le délai de grâce', () => {
    expect(
      resolveJobsGateTypes('DRIVER', {
        requireDocumentsForJobs: true,
        requiredDriverDocuments: ['SELFIE', 'ID_PHOTO'],
      }),
    ).toEqual(['SELFIE', 'ID_PHOTO']);
    expect(documentsGraceElapsed(new Date(), 7)).toBe(false);
    expect(documentsGraceElapsed(new Date(Date.now() - 10 * 86400000), 7)).toBe(true);
    const reminder = buildDocumentsReminder({
      requireDocumentsForJobs: true,
      gracePeriodDays: 3,
      createdAt: new Date(),
      missingTypes: ['SELFIE'],
    });
    expect(reminder.active).toBe(true);
    expect(reminder.blocked).toBe(false);
    expect(reminder.message).toContain('Photo récente');
    expect(reminder.message).toMatch(/jour/);
  });

  it('affiche les heures restantes quand le délai est sous 24 h', () => {
    const createdAt = new Date(Date.now() - 6.5 * 86400000);
    const reminder = buildDocumentsReminder({
      requireDocumentsForJobs: true,
      gracePeriodDays: 7,
      createdAt,
      missingTypes: ['ID_PHOTO'],
    });
    expect(reminder.active).toBe(true);
    expect(reminder.blocked).toBe(false);
    expect(reminder.hoursRemaining).toBeGreaterThan(0);
    expect(reminder.hoursRemaining!).toBeLessThan(24);
    expect(reminder.message).toMatch(/heure/);
  });
});

describe('libellés KYC admin', () => {
  it('traduit RCCM et identité gérant, pas l\'enum brut', () => {
    expect(kycDocumentLabel('RCCM')).toBe("RCCM ou preuve d'activité");
    expect(kycDocumentLabel('MANAGER_ID')).toMatch(/Identité du gérant/);
    expect(kycDocumentLabel('DRIVERS_LICENSE')).toBe('Permis de conduire');
  });

  it('distingue chauffeur, restaurant et location entreprise / particulier', () => {
    expect(kycPartnerKindLabel('DRIVER')).toBe('Chauffeur');
    expect(kycPartnerKindLabel('RESTAURANT')).toBe('Restaurant');
    expect(kycPartnerKindLabel('RENTAL_COMPANY')).toBe('Location (entreprise)');
    expect(kycPartnerKindLabel('RENTAL_INDIVIDUAL')).toBe('Location (particulier)');
    expect(rentalKycPartnerKind('COMPANY')).toBe('RENTAL_COMPANY');
    expect(rentalKycPartnerKind('INDIVIDUAL')).toBe('RENTAL_INDIVIDUAL');
  });
});

describe('allPartnerJustificatifsApproved', () => {
  it('exige chaque justificatif requis ou envoyé en APPROVED', () => {
    expect(
      allPartnerJustificatifsApproved([
        { required: true, uploaded: true, status: 'APPROVED' },
        { required: true, uploaded: true, status: 'PENDING' },
      ]),
    ).toBe(false);
    expect(
      allPartnerJustificatifsApproved([
        { required: true, uploaded: true, status: 'APPROVED' },
        { required: true, uploaded: true, status: 'APPROVED' },
        { required: false, uploaded: false, status: null },
      ]),
    ).toBe(true);
  });
});

describe('allDriverJustificatifsApproved', () => {
  it('refuse le dossier tant qu\'un justificatif obligatoire n\'est pas APPROVED', () => {
    expect(
      allDriverJustificatifsApproved([
        { type: 'ID_PHOTO', required: true, uploaded: true, status: 'APPROVED' },
        { type: 'SELFIE', required: true, uploaded: true, status: 'PENDING' },
      ]),
    ).toBe(false);
  });

  it('accepte seulement quand tous les justificatifs obligatoires sont APPROVED', () => {
    expect(
      allDriverJustificatifsApproved([
        { type: 'ID_PHOTO', required: true, uploaded: true, status: 'APPROVED' },
        { type: 'SELFIE', required: true, uploaded: true, status: 'APPROVED' },
        { type: 'DRIVERS_LICENSE', required: true, uploaded: true, status: 'APPROVED' },
        { type: 'VEHICLE_INSURANCE', required: true, uploaded: true, status: 'APPROVED' },
        { type: 'TECHNICAL_INSPECTION', required: true, uploaded: true, status: 'APPROVED' },
        { type: 'VEHICLE_REGISTRATION', required: false, uploaded: false, status: null },
        { type: 'CRIMINAL_RECORD', required: false, uploaded: false, status: null },
      ]),
    ).toBe(true);
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

describe('KYC notify copy', () => {
  it('inclut le motif de refus pour chauffeur et partenaire', () => {
    const driver = kycRejectNotifyCopy({
      partnerKindLabel: 'Chauffeur',
      documentLabel: 'Permis de conduire',
      reason: 'Photo floue, recommencer',
    });
    expect(driver.smsText).toContain('Permis de conduire');
    expect(driver.smsText).toContain('Photo floue, recommencer');
    expect(driver.emailText).toContain('Photo floue, recommencer');
    const resto = kycRejectNotifyCopy({
      partnerKindLabel: 'Restaurant',
      documentLabel: "RCCM ou preuve d'activité",
      reason: 'RCCM illisible, renvoyer une photo nette',
    });
    expect(resto.smsText).toContain('Restaurant');
    expect(resto.smsText).toContain('RCCM illisible');
  });

  it('ne met pas le PIN dans le sujet e-mail', () => {
    const copy = driverActivationPinNotifyCopy('111657');
    expect(copy.smsText).toContain('111657');
    expect(copy.emailText).toContain('111657');
    expect(copy.emailSubject).toBe('Votre accès SENGA — AfriSoft');
    expect(copy.emailSubject).not.toContain('111657');
    expect(copy.emailSubject).not.toMatch(/code PIN/i);
    expect(copy.emailSubject).not.toMatch(/OTP/i);
    expect(copy.smsText).toMatch(/activation et connexion/);
  });
});
