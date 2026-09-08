import { classifyAdminPartner } from './partner-admin-visibility';

describe('classifyAdminPartner', () => {
  it('hides a KYC profile with no auth user', () => {
    expect(classifyAdminPartner(null)).toEqual({
      hidden: true,
      reason: 'orphan',
      userRole: null,
    });
  });

  it('shows a Google-only restaurant account', () => {
    expect(
      classifyAdminPartner({
        id: 'r1',
        role: 'RESTAURANT',
        phone: null,
        email: 'chezflore.kin@gmail.com',
        firstName: 'Flore',
      }),
    ).toEqual({ hidden: false, reason: null, userRole: 'RESTAURANT' });
  });

  it('shows a numbered Gmail rental partner (not official Test Lab)', () => {
    expect(
      classifyAdminPartner({
        id: 'l1',
        role: 'RENTAL_PARTNER',
        phone: null,
        email: 'flotte.goma.12345@gmail.com',
      }),
    ).toEqual({ hidden: false, reason: null, userRole: 'RENTAL_PARTNER' });
  });

  it('hides official Cloud Test Lab even with a partner role', () => {
    expect(
      classifyAdminPartner({
        id: 'bot',
        role: 'RESTAURANT',
        phone: null,
        email: 'aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com',
        firstName: 'Nuage',
        lastName: 'Laboratoire',
      }),
    ).toMatchObject({ hidden: true, reason: 'play_prelaunch' });
  });
});
