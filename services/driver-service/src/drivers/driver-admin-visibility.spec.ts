import { classifyAdminDriver } from './driver-admin-visibility';

describe('classifyAdminDriver', () => {
  it('hides a profile with no auth user', () => {
    expect(classifyAdminDriver(null, { onboardingCompleted: false, kycDocumentsUploaded: 0 })).toEqual({
      hidden: true,
      reason: 'orphan',
      userRole: null,
    });
  });

  it('hides Play Test Lab accounts even if KYC was approved', () => {
    expect(
      classifyAdminDriver(
        { id: 'bot', role: 'DRIVER', phone: null, email: 'geoffreyfrancis.83292@gmail.com' },
        { onboardingCompleted: true, kycDocumentsUploaded: 3 },
      ),
    ).toMatchObject({ hidden: true, reason: 'play_prelaunch' });
  });

  it('shows a real DRIVER account', () => {
    expect(
      classifyAdminDriver(
        { id: 'd1', role: 'DRIVER', phone: '+243811111111', firstName: 'Jean' },
        { onboardingCompleted: false, kycDocumentsUploaded: 0 },
      ),
    ).toEqual({ hidden: false, reason: null, userRole: 'DRIVER' });
  });

  it('hides a leftover profile on a passenger / partner with no dossier', () => {
    expect(
      classifyAdminDriver(
        { id: 'p1', role: 'PASSENGER', phone: '+243893515173' },
        { onboardingCompleted: false, kycDocumentsUploaded: 0 },
      ),
    ).toMatchObject({ hidden: true, reason: 'leftover', userRole: 'PASSENGER' });
  });

  it('keeps a non-DRIVER user who actually submitted chauffeur docs', () => {
    expect(
      classifyAdminDriver(
        { id: 'p2', role: 'PASSENGER', phone: '+243810000099' },
        { onboardingCompleted: true, kycDocumentsUploaded: 4 },
      ),
    ).toEqual({ hidden: false, reason: null, userRole: 'PASSENGER' });
  });
});
