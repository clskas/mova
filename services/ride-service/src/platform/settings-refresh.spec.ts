import { Logger } from '@nestjs/common';
import { ClientAppsConfigService } from './client-apps-config.service';
import { SETTINGS_REFRESH_MS, startSettingsRefresh } from './settings-refresh';

describe('settings refresh across instances', () => {
  afterEach(() => jest.useRealTimers());

  it('re-reads the settings every SETTINGS_REFRESH_MS and never throws', async () => {
    jest.useFakeTimers();
    const reload = jest.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const logger = { warn: jest.fn() } as unknown as Logger;
    const timer = startSettingsRefresh(reload, logger, 'Test');
    jest.advanceTimersByTime(SETTINGS_REFRESH_MS * 2);
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(2);
    clearInterval(timer);
  });

  it('an instance picks up a ceiling saved through another instance', async () => {
    let stored: object = { walletWithdraw: { otherNumberDailyMaxCdf: 0 } };
    const prisma = {
      platformConfig: {
        upsert: jest.fn(),
        findUnique: jest.fn(async () => ({ id: 'client-apps', config: stored })),
      },
    };
    const instanceB = new ClientAppsConfigService(prisma as never);
    await instanceB.refresh();
    expect(instanceB.get().walletWithdraw.otherNumberDailyMaxCdf).toBe(0);
    // Instance A saves 200 000 FC; instance B re-reads it on its next refresh.
    stored = { walletWithdraw: { otherNumberDailyMaxCdf: 200_000 } };
    await instanceB.reloadFromDb();
    expect(instanceB.get().walletWithdraw.otherNumberDailyMaxCdf).toBe(200_000);
    expect(prisma.platformConfig.upsert).toHaveBeenCalledTimes(1);
  });
});
