import { isSmsPurposeAllowed } from './sms.providers';

// SMS cost money: only access codes go by SMS, notifications go through the app.
describe('isSmsPurposeAllowed', () => {
  it.each(['login', 'login_pin', 'driver_activation'])('autorise le code d\'accès « %s »', (purpose) => {
    expect(isSmsPurposeAllowed(purpose, {})).toBe(true);
  });

  it.each(['notify', 'kyc_reject', 'delivery_pin', 'delivery_unreachable', 'moving_volume', 'platform_vendor_expiry', undefined])(
    'bloque la notification « %s »',
    (purpose) => {
      expect(isSmsPurposeAllowed(purpose as string | undefined, {})).toBe(false);
    },
  );

  it('SMS_NOTIFICATIONS_ENABLED=true remet tous les SMS', () => {
    expect(isSmsPurposeAllowed('notify', { SMS_NOTIFICATIONS_ENABLED: 'true' })).toBe(true);
  });
});

describe('isNotificationSmsSwitchOn (admin › SMS de notification)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isNotificationSmsSwitchOn, resetNotificationSmsSwitchCache } = require('./sms.providers');
  beforeEach(() => resetNotificationSmsSwitchCache());

  it('lit le réglage du super admin', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ sosSms: { notificationSms: true } }) }) as never;
    expect(await isNotificationSmsSwitchOn()).toBe(true);
  });

  it('coupé par défaut et quand les réglages sont injoignables', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ sosSms: {} }) }) as never;
    expect(await isNotificationSmsSwitchOn()).toBe(false);
    resetNotificationSmsSwitchCache();
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as never;
    expect(await isNotificationSmsSwitchOn()).toBe(false);
  });
});
