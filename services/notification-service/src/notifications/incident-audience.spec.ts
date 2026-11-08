jest.mock('../common/user-lookup.util', () => ({
  fetchAuthUserBrief: jest.fn().mockResolvedValue({ name: 'Amani', phone: '+243811111111' }),
  fetchOpsStaffForAlerts: jest.fn().mockResolvedValue([
    { id: 'ops1', phone: '+243822222222', role: 'SUPPORT' },
    { id: 'pax9', phone: '+243844444444', role: 'PASSENGER', audienceOnly: true },
  ]),
  fetchSosSmsConfig: jest.fn(),
  fetchTrustedContacts: jest.fn().mockResolvedValue([]),
}));

import { DEFAULT_SOS_SMS_CONFIG } from '@mova/shared';
import { NotificationsService } from './notifications.service';
import { fetchSosSmsConfig } from '../common/user-lookup.util';

function setup() {
  const sms = { sendMessage: jest.fn().mockResolvedValue({ success: true }) };
  const prisma = { notification: { create: jest.fn().mockResolvedValue({}) } };
  const fcm = { isConfigured: () => false, sendToTokens: jest.fn() };
  const svc = new NotificationsService(
    prisma as never,
    {} as never,
    sms as never,
    fcm as never,
    { sendToUsers: jest.fn().mockResolvedValue(0), isConfigured: () => false } as never,
    { tokensForUsersAnyFlavor: jest.fn().mockResolvedValue([]) } as never,
  );
  const recipients = () => prisma.notification.create.mock.calls.map((c) => c[0].data.userId);
  return { svc, prisma, recipients };
}

describe('Incident notifications — who is told', () => {
  beforeEach(() => {
    (fetchSosSmsConfig as jest.Mock).mockResolvedValue({ ...DEFAULT_SOS_SMS_CONFIG });
  });

  it('a fraud alert never notifies the suspect (created / taken / closed)', async () => {
    const { svc, recipients } = setup();
    const fraud = { incidentId: 'f1', userId: 'suspect', type: 'FRAUD', referenceType: 'FRAUD_AUTO', isEmergency: false };
    await svc.onIncidentCreated(fraud);
    await svc.onIncidentAcknowledged({ ...fraud, byName: 'Marie K.' });
    await svc.onIncidentResolved({ ...fraud, byName: 'Marie K.' });
    expect(recipients()).not.toContain('suspect');
    expect(recipients()).toContain('ops1');
  });

  it('an ordinary dispute reaches the team, not the SOS audiences', async () => {
    const { svc, recipients } = setup();
    await svc.onIncidentCreated({ incidentId: 'c1', userId: 'driver1', type: 'CASH_NOT_RECEIVED', isEmergency: false });
    expect(recipients()).toEqual(expect.arrayContaining(['driver1', 'ops1']));
    expect(recipients()).not.toContain('pax9');
  });

  it('a real SOS still reaches the SOS audiences', async () => {
    const { svc, recipients } = setup();
    await svc.onIncidentCreated({ incidentId: 's1', userId: 'u1', type: 'SOS', isEmergency: true });
    expect(recipients()).toEqual(expect.arrayContaining(['u1', 'ops1', 'pax9']));
  });

  it('the reporter is told the outcome when the dispute is closed', async () => {
    const { svc, prisma } = setup();
    await svc.onIncidentResolved({
      incidentId: 'c1',
      userId: 'driver1',
      type: 'CASH_NOT_RECEIVED',
      outcome: 'Le client a payé — paiement confirmé',
    });
    const body = prisma.notification.create.mock.calls[0][0].data.body as string;
    expect(body).toContain('Le client a payé');
  });
});
