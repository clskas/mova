jest.mock('../common/user-lookup.util', () => ({
  fetchAuthUserBrief: jest.fn().mockResolvedValue({ name: 'Amani', phone: '+243811111111' }),
  fetchOpsStaffForAlerts: jest.fn().mockResolvedValue([{ id: 'ops1', phone: '+243822222222', role: 'SUPPORT' }]),
  fetchSosSmsConfig: jest.fn(),
  fetchTrustedContacts: jest.fn().mockResolvedValue([{ name: 'Maman', phone: '+243833333333' }]),
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
  return { svc, sms };
}

const sos = { incidentId: 'i1', userId: 'u1', type: 'SOS', isEmergency: true, lat: -4.3, lng: 15.3 };
const incident = { incidentId: 'i2', userId: 'u1', type: 'ACCIDENT', isEmergency: false };

describe('SOS / incident SMS switches', () => {
  it('sends SOS SMS to the team and the emergency contacts by default', async () => {
    (fetchSosSmsConfig as jest.Mock).mockResolvedValue({ ...DEFAULT_SOS_SMS_CONFIG });
    const { svc, sms } = setup();
    await svc.onIncidentCreated(sos);
    const to = sms.sendMessage.mock.calls.map((c) => c[0]);
    expect(to).toEqual(['+243822222222', '+243833333333']);
  });

  it('sends no SMS at all when the super admin turned them off', async () => {
    (fetchSosSmsConfig as jest.Mock).mockResolvedValue({
      ...DEFAULT_SOS_SMS_CONFIG,
      toStaffForSos: false,
      toTrustedContacts: false,
    });
    const { svc, sms } = setup();
    await svc.onIncidentCreated(sos);
    expect(sms.sendMessage).not.toHaveBeenCalled();
  });

  it('non-urgent incidents send SMS only when switched on', async () => {
    (fetchSosSmsConfig as jest.Mock).mockResolvedValue({ ...DEFAULT_SOS_SMS_CONFIG });
    const off = setup();
    await off.svc.onIncidentCreated(incident);
    expect(off.sms.sendMessage).not.toHaveBeenCalled();

    (fetchSosSmsConfig as jest.Mock).mockResolvedValue({ ...DEFAULT_SOS_SMS_CONFIG, toStaffForIncidents: true });
    const on = setup();
    await on.svc.onIncidentCreated(incident);
    expect(on.sms.sendMessage.mock.calls.map((c) => c[0])).toEqual(['+243822222222']);
  });

  it('escalation SMS follow their own switch', async () => {
    (fetchSosSmsConfig as jest.Mock).mockResolvedValue({ ...DEFAULT_SOS_SMS_CONFIG, escalationSms: false });
    const { svc, sms } = setup();
    await svc.onIncidentEscalated({ incidentId: 'i1', userId: 'u1', type: 'SOS', isEmergency: true });
    expect(sms.sendMessage).not.toHaveBeenCalled();
  });
});
