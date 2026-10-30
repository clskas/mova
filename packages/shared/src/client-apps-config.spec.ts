import {
  ClientAppsConfig,
  DEFAULT_CLIENT_APPS_CONFIG,
  enabledMmOperators,
  isMmOperatorEnabled,
  mergeClientAppsConfig,
} from './client-apps-config';

describe('client-apps-config merge', () => {
  it('hides Orange Money by default', () => {
    const cfg = mergeClientAppsConfig(undefined);
    expect(cfg.mobileMoney.senga.ORANGE_MONEY).toEqual({ topup: false, withdraw: false });
    expect(cfg.mobileMoney.senga.MPESA).toEqual({ topup: true, withdraw: true });
    expect(cfg.mobileMoney.resto.AIRTEL_MONEY.topup).toBe(true);
    expect(cfg.maintenance.apps.senga).toBe(false);
    expect(cfg.passengerServices.taxi).toBe(true);
  });

  it('merges legacy boolean MM flags into topup+withdraw', () => {
    const cfg = mergeClientAppsConfig({
      mobileMoney: {
        senga: { ORANGE_MONEY: true, MPESA: false },
      },
    } as unknown as Partial<ClientAppsConfig>);
    expect(cfg.mobileMoney.senga.ORANGE_MONEY).toEqual({ topup: true, withdraw: true });
    expect(cfg.mobileMoney.senga.MPESA).toEqual({ topup: false, withdraw: false });
  });

  it('merges partial maintenance flags', () => {
    const cfg = mergeClientAppsConfig({
      maintenance: {
        messageFr: 'Test maintenance SENGA',
        apps: { senga: true },
      },
    } as Partial<ClientAppsConfig>);
    expect(cfg.maintenance.messageFr).toBe('Test maintenance SENGA');
    expect(cfg.maintenance.apps.senga).toBe(true);
    expect(cfg.maintenance.apps.resto).toBe(false);
    expect(cfg.mobileMoney.senga_driver.ORANGE_MONEY).toEqual(
      DEFAULT_CLIENT_APPS_CONFIG.mobileMoney.senga_driver.ORANGE_MONEY,
    );
  });

  it('filters operators by channel', () => {
    const cfg = mergeClientAppsConfig({
      mobileMoney: {
        senga: {
          MPESA: { topup: true, withdraw: false },
          AIRTEL_MONEY: { topup: false, withdraw: true },
        },
      },
    } as unknown as Partial<ClientAppsConfig>);
    expect(enabledMmOperators(cfg, 'senga', 'topup')).toEqual(['MPESA']);
    expect(enabledMmOperators(cfg, 'senga', 'withdraw')).toEqual(['AIRTEL_MONEY']);
    expect(isMmOperatorEnabled(cfg, 'senga', 'MPESA', 'withdraw')).toBe(false);
  });

  it('merges sosAlertAudiences', () => {
    const cfg = mergeClientAppsConfig({
      sosAlertAudiences: ['PASSENGER', 'partner', 'NOPE', 'DRIVER'],
    } as unknown as Partial<ClientAppsConfig>);
    expect(cfg.sosAlertAudiences).toEqual(['PASSENGER', 'PARTNER', 'DRIVER']);
  });

  it('defaults sosEmergencyContacts to 112', () => {
    const cfg = mergeClientAppsConfig(undefined);
    expect(cfg.sosEmergencyContacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phone: '112', enabled: true }),
      ]),
    );
  });

  it('merges sosEmergencyContacts and drops invalid rows', () => {
    const cfg = mergeClientAppsConfig({
      sosEmergencyContacts: [
        { id: 'p1', label: 'Police', phone: '+243 81 000 0000', sortOrder: 2, enabled: true },
        { id: 'bad', label: '', phone: '999', enabled: true },
        { label: 'Pompiers', phone: '118', sortOrder: 1, enabled: false },
      ],
    } as unknown as Partial<ClientAppsConfig>);
    expect(cfg.sosEmergencyContacts).toHaveLength(2);
    expect(cfg.sosEmergencyContacts[0].label).toBe('Pompiers');
    expect(cfg.sosEmergencyContacts[0].enabled).toBe(false);
    expect(cfg.sosEmergencyContacts[1].phone).toMatch(/^\+243/);
  });
});
