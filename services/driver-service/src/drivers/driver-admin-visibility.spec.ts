import { classifyAdminDriver } from './driver-admin-visibility';

describe('classifyAdminDriver', () => {
  it('hides a profile with no auth user (404)', () => {
    expect(
      classifyAdminDriver(null, {
        onboardingCompleted: false,
        kycDocumentsUploaded: 0,
        authLookup: 'not_found',
      }),
    ).toEqual({
      hidden: true,
      reason: 'orphan',
      userRole: null,
    });
  });

  it('shows a real dossier when auth lookup is unavailable (fail-open)', () => {
    expect(
      classifyAdminDriver(null, {
        onboardingCompleted: true,
        kycDocumentsUploaded: 4,
        kycStatus: 'APPROVED',
        authLookup: 'unavailable',
      }),
    ).toEqual({ hidden: false, reason: null, userRole: null });
  });

  it('still hides empty shells when auth is unavailable', () => {
    expect(
      classifyAdminDriver(null, {
        onboardingCompleted: false,
        kycDocumentsUploaded: 0,
        authLookup: 'unavailable',
      }),
    ).toMatchObject({ hidden: true, reason: 'orphan' });
  });

  it('hides official Cloud Test Lab even if KYC was approved', () => {
    expect(
      classifyAdminDriver(
        {
          id: 'bot',
          role: 'DRIVER',
          phone: null,
          email: 'aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com',
          firstName: 'Nuage',
          lastName: 'Laboratoire',
        },
        { onboardingCompleted: true, kycDocumentsUploaded: 3, authLookup: 'ok' },
      ),
    ).toMatchObject({ hidden: true, reason: 'play_prelaunch' });
  });

  it('shows a Google DRIVER without phone (not Test Lab)', () => {
    expect(
      classifyAdminDriver(
        {
          id: 'd-google',
          role: 'DRIVER',
          phone: null,
          email: 'afriri75@gmail.com',
          firstName: 'Kike',
          lastName: 'Sala',
        },
        { onboardingCompleted: true, kycDocumentsUploaded: 6, kycStatus: 'APPROVED', authLookup: 'ok' },
      ),
    ).toEqual({ hidden: false, reason: null, userRole: 'DRIVER' });
  });

  it('shows a DRIVER with numbered Gmail who has a real account link', () => {
    expect(
      classifyAdminDriver(
        {
          id: 'd-num',
          role: 'DRIVER',
          phone: null,
          email: 'martinpearson.39569@gmail.com',
          firstName: 'Martin',
          lastName: 'Pearson',
        },
        { onboardingCompleted: true, kycDocumentsUploaded: 2, authLookup: 'ok' },
      ),
    ).toEqual({ hidden: false, reason: null, userRole: 'DRIVER' });
  });

  it('hides Play virtual Gmail when role is not DRIVER and no dossier', () => {
    expect(
      classifyAdminDriver(
        { id: 'bot', role: 'PASSENGER', phone: null, email: 'geoffreyfrancis.83292@gmail.com' },
        { onboardingCompleted: false, kycDocumentsUploaded: 0, authLookup: 'ok' },
      ),
    ).toMatchObject({ hidden: true, reason: 'play_prelaunch' });
  });

  it('shows a real DRIVER account', () => {
    expect(
      classifyAdminDriver(
        { id: 'd1', role: 'DRIVER', phone: '+243811111111', firstName: 'Jean' },
        { onboardingCompleted: false, kycDocumentsUploaded: 0, authLookup: 'ok' },
      ),
    ).toEqual({ hidden: false, reason: null, userRole: 'DRIVER' });
  });

  it('hides a leftover profile on a passenger / partner with no dossier', () => {
    expect(
      classifyAdminDriver(
        { id: 'p1', role: 'PASSENGER', phone: '+243893515173' },
        { onboardingCompleted: false, kycDocumentsUploaded: 0, authLookup: 'ok' },
      ),
    ).toMatchObject({ hidden: true, reason: 'leftover', userRole: 'PASSENGER' });
  });

  it('keeps a non-DRIVER user who actually submitted chauffeur docs', () => {
    expect(
      classifyAdminDriver(
        { id: 'p2', role: 'PASSENGER', phone: '+243810000099' },
        { onboardingCompleted: true, kycDocumentsUploaded: 4, authLookup: 'ok' },
      ),
    ).toEqual({ hidden: false, reason: null, userRole: 'PASSENGER' });
  });
});
