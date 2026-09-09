import {
  isAdminHiddenPlayAccount,
  isCloudTestLabEmail,
  isOfficialPlayTestLabAccount,
  isPlayPrelaunchAccount,
  isPlayPrelaunchDisplayName,
  isPlayVirtualGmail,
} from './play-prelaunch';

describe('play-prelaunch accounts', () => {
  it('detects Firebase Cloud Test Lab mailboxes', () => {
    expect(isCloudTestLabEmail('aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com')).toBe(true);
    expect(isCloudTestLabEmail('celestinkas@gmail.com')).toBe(false);
  });

  it('detects Play virtual numbered Gmail', () => {
    expect(isPlayVirtualGmail('martinpearson.39569@gmail.com')).toBe(true);
    expect(isPlayVirtualGmail('drewdixon.28633@gmail.com')).toBe(true);
    expect(isPlayVirtualGmail('geoffreyfrancis.83292@gmail.com')).toBe(true);
    expect(isPlayVirtualGmail('greggyoung.57192@gmail.com')).toBe(true);
    expect(isPlayVirtualGmail('first.last.39569@gmail.com')).toBe(true);
    expect(isPlayVirtualGmail('celestinkas@gmail.com')).toBe(false);
    expect(isPlayVirtualGmail('marie.kabila@gmail.com')).toBe(false);
    expect(isPlayVirtualGmail('jean.pierre.mukendi@gmail.com')).toBe(false);
  });

  it('detects Cloud Test Lab display names', () => {
    expect(isPlayPrelaunchDisplayName('Nuage', 'Laboratoire')).toBe(true);
    expect(isPlayPrelaunchDisplayName('Cloud Test Lab', null)).toBe(true);
    expect(isPlayPrelaunchDisplayName('Marie', 'Kabila')).toBe(false);
  });

  it('never flags an account that has a phone', () => {
    expect(
      isPlayPrelaunchAccount({
        email: 'martinpearson.39569@gmail.com',
        phone: '+243812345678',
      }),
    ).toBe(false);
    expect(
      isPlayPrelaunchAccount({
        email: 'bot@cloudtestlabaccounts.com',
        phone: '+243971163574',
      }),
    ).toBe(false);
  });

  it('flags phoneless Play / Test Lab rows from admin screenshots', () => {
    expect(
      isPlayPrelaunchAccount({ email: 'martinpearson.39569@gmail.com', phone: null }),
    ).toBe(true);
    expect(
      isPlayPrelaunchAccount({
        email: 'aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com',
        firstName: 'Nuage',
        lastName: 'Laboratoire',
        phone: null,
      }),
    ).toBe(true);
    expect(
      isPlayPrelaunchAccount({ email: 'celestinkas@gmail.com', phone: null }),
    ).toBe(false);
  });

  it('keeps restaurant and rental Google accounts on Utilisateurs', () => {
    expect(
      isAdminHiddenPlayAccount({
        email: 'chezflore.kin@gmail.com',
        phone: null,
        role: 'RESTAURANT',
      }),
    ).toBe(false);
    expect(
      isAdminHiddenPlayAccount({
        email: 'flotte.goma.12345@gmail.com',
        phone: null,
        role: 'RENTAL_PARTNER',
      }),
    ).toBe(false);
    expect(
      isOfficialPlayTestLabAccount({
        email: 'aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com',
        phone: null,
        role: 'RESTAURANT',
      }),
    ).toBe(true);
    expect(
      isAdminHiddenPlayAccount({
        email: 'aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com',
        phone: null,
        role: 'RESTAURANT',
      }),
    ).toBe(true);
  });

  it('keeps Google DRIVER accounts (personal or numbered Gmail) on Chauffeurs / Utilisateurs', () => {
    expect(
      isAdminHiddenPlayAccount({
        email: 'afriri75@gmail.com',
        phone: null,
        role: 'DRIVER',
        firstName: 'Kike',
        lastName: 'Sala',
      }),
    ).toBe(false);
    expect(
      isAdminHiddenPlayAccount({
        email: 'martinpearson.39569@gmail.com',
        phone: null,
        role: 'DRIVER',
      }),
    ).toBe(false);
    expect(
      isAdminHiddenPlayAccount({
        email: 'aqwza7hpyxgwc3pve4yeil-lvl-02@cloudtestlabaccounts.com',
        phone: null,
        role: 'DRIVER',
        firstName: 'Nuage',
        lastName: 'Laboratoire',
      }),
    ).toBe(true);
  });
});
