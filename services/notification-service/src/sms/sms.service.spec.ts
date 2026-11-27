import { SmsService } from './sms.service';

// SMS are kept for access codes and SOS: ride / payment notifications go through the app.
describe('SmsService — notifications go through the app, not SMS', () => {
  const config = { get: jest.fn((key: string) => (key === 'MOCK_SMS' ? 'true' : undefined)) };
  const service = new SmsService(config as never);
  const saved = process.env.SMS_NOTIFICATIONS_ENABLED;

  afterEach(() => {
    if (saved === undefined) delete process.env.SMS_NOTIFICATIONS_ENABLED;
    else process.env.SMS_NOTIFICATIONS_ENABLED = saved;
  });

  it('ne envoie pas de SMS pour une notification (nouvelle course, rappel)', async () => {
    delete process.env.SMS_NOTIFICATIONS_ENABLED;
    const res = await service.sendMessage('+243810000001', 'SENGA Driver: Nouvelle course SENGA.');
    expect(res.success).toBe(false);
  });

  it('envoie encore les alertes SOS par SMS', async () => {
    delete process.env.SMS_NOTIFICATIONS_ENABLED;
    const res = await service.sendMessage('+243810000001', 'SENGA SOS', undefined, { sos: true });
    expect(res.success).toBe(true);
  });

  it('SMS_NOTIFICATIONS_ENABLED=true remet les notifications par SMS', async () => {
    process.env.SMS_NOTIFICATIONS_ENABLED = 'true';
    const res = await service.sendMessage('+243810000001', 'SENGA rappel');
    expect(res.success).toBe(true);
  });
});
