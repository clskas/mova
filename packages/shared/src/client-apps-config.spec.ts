import {
  ClientAppsConfig,
  DEFAULT_CLIENT_APPS_CONFIG,
  mergeClientAppsConfig,
} from './client-apps-config';

describe('client-apps-config merge', () => {
  it('hides Orange Money by default', () => {
    const cfg = mergeClientAppsConfig(undefined);
    expect(cfg.mobileMoney.senga.ORANGE_MONEY).toBe(false);
    expect(cfg.mobileMoney.senga.MPESA).toBe(true);
    expect(cfg.mobileMoney.resto.AIRTEL_MONEY).toBe(true);
    expect(cfg.maintenance.apps.senga).toBe(false);
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
    expect(cfg.mobileMoney.senga_driver.ORANGE_MONEY).toBe(
      DEFAULT_CLIENT_APPS_CONFIG.mobileMoney.senga_driver.ORANGE_MONEY,
    );
  });
});
