import { SmsService, resetNotificationSmsSwitchCache } from './sms.service';

// SMS cost money: notifications go by SMS only when the super admin turns
// « SMS de notification » on. SOS alerts have their own switches.
describe('SmsService — interrupteur « SMS de notification »', () => {
  const config = { get: jest.fn((key: string) => (key === 'MOCK_SMS' ? 'true' : undefined)) };
  const service = new SmsService(config as never);
  const saved = process.env.SMS_NOTIFICATIONS_ENABLED;

  function switchIs(on: boolean) {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ sosSms: { notificationSms: on } }) }) as never;
  }

  beforeEach(() => {
    delete process.env.SMS_NOTIFICATIONS_ENABLED;
    resetNotificationSmsSwitchCache();
  });
  afterAll(() => {
    if (saved !== undefined) process.env.SMS_NOTIFICATIONS_ENABLED = saved;
  });

  it('interrupteur coupé : pas de SMS pour une notification (nouvelle course, rappel)', async () => {
    switchIs(false);
    const res = await service.sendMessage('+243810000001', 'SENGA Driver: Nouvelle course SENGA.');
    expect(res.success).toBe(false);
  });

  it('interrupteur allumé : la notification part par SMS', async () => {
    switchIs(true);
    const res = await service.sendMessage('+243810000001', 'SENGA Driver: Nouvelle course SENGA.');
    expect(res.success).toBe(true);
  });

  it('les alertes SOS partent même interrupteur coupé', async () => {
    switchIs(false);
    const res = await service.sendMessage('+243810000001', 'SENGA SOS', undefined, { sos: true });
    expect(res.success).toBe(true);
  });

  it('réglages injoignables : pas de SMS de notification', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as never;
    const res = await service.sendMessage('+243810000001', 'SENGA rappel');
    expect(res.success).toBe(false);
  });
});
