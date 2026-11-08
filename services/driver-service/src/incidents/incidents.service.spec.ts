import { HttpException } from '@nestjs/common';
import { IncidentType } from '@prisma/client';
import { MOVA_EVENTS } from '@mova/shared';
import { IncidentsService, SOS_ESCALATION_MS, normalizeRdcPhone } from './incidents.service';

function setup(overrides: Record<string, unknown> = {}) {
  const prisma = {
    incident: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'i1', createdAt: new Date(), lat: null, lng: null, rideId: null, referenceType: null, referenceId: null, ...data })),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data, where }) => Promise.resolve({ id: where.id, userId: 'u1', type: 'SOS', isEmergency: true, lat: 1, lng: 2, ...data })),
    },
    trustedContact: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockReturnValue('del'),
      create: jest.fn().mockImplementation(({ data }) => data),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  const redis = { publish: jest.fn().mockResolvedValue(1) };
  const svc = new IncidentsService(prisma as never, redis as never);
  return { svc, prisma, redis };
}

describe('IncidentsService', () => {
  it('normalizes DRC phone numbers', () => {
    expect(normalizeRdcPhone('0812345678')).toBe('+243812345678');
    expect(normalizeRdcPhone('+243 81 234 5678')).toBe('+243812345678');
    expect(normalizeRdcPhone('12345')).toBeNull();
  });

  it('refuses a 4th SOS within 10 minutes', async () => {
    const { svc, prisma } = setup();
    prisma.incident.count.mockResolvedValue(3);
    await expect(svc.create({ userId: 'u1', type: IncidentType.SOS, description: 'x' })).rejects.toBeInstanceOf(HttpException);
    expect(prisma.incident.create).not.toHaveBeenCalled();
  });

  it('starts the trail with the first SOS position and publishes the event', async () => {
    const { svc, prisma, redis } = setup();
    await svc.create({ userId: 'u1', type: IncidentType.SOS, description: 'x', lat: -4.3, lng: 15.3 });
    const data = prisma.incident.create.mock.calls[0][0].data;
    expect(data.isEmergency).toBe(true);
    expect(data.trail).toHaveLength(1);
    expect(redis.publish).toHaveBeenCalledWith(MOVA_EVENTS.INCIDENT_CREATED, expect.objectContaining({ isEmergency: true }));
  });

  it('accepts live positions only for the owner, for an open SOS, within 30 minutes', async () => {
    const { svc, prisma } = setup();
    prisma.incident.findFirst.mockResolvedValue({ id: 'i1', isEmergency: true, status: 'OPEN', createdAt: new Date(), trail: [] });
    expect(await svc.addLocation('u1', 'i1', -4.3, 15.3)).toEqual({ tracking: true });
    prisma.incident.findFirst.mockResolvedValue({ id: 'i1', isEmergency: true, status: 'OPEN', createdAt: new Date(Date.now() - 31 * 60_000), trail: [] });
    expect(await svc.addLocation('u1', 'i1', -4.3, 15.3)).toEqual({ tracking: false });
    await expect(svc.addLocation('u1', 'i1', 999, 15.3)).rejects.toThrow('Position invalide.');
  });

  it('acknowledge records who took it and tells the user', async () => {
    const { svc, prisma, redis } = setup();
    prisma.incident.findUnique.mockResolvedValue({ id: 'i1', acknowledgedAt: null, notes: [] });
    await svc.acknowledge('i1', 'admin1', 'Marie K.');
    const data = prisma.incident.update.mock.calls[0][0].data;
    expect(data.acknowledgedByName).toBe('Marie K.');
    expect(data.notes[0]).toMatchObject({ by: 'Marie K.', text: 'Pris en charge' });
    expect(redis.publish).toHaveBeenCalledWith(MOVA_EVENTS.INCIDENT_ACKNOWLEDGED, expect.objectContaining({ byName: 'Marie K.' }));
  });

  it('escalates SOS not taken after 2 minutes, once', async () => {
    const { svc, prisma, redis } = setup();
    const now = Date.now();
    prisma.incident.findMany.mockResolvedValue([{ id: 'i1' }]);
    expect(await svc.escalateUnacknowledged(now)).toBe(1);
    const where = prisma.incident.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ isEmergency: true, status: 'OPEN', acknowledgedAt: null, escalatedAt: null });
    expect(where.createdAt.lte.getTime()).toBe(now - SOS_ESCALATION_MS);
    expect(redis.publish).toHaveBeenCalledWith(MOVA_EVENTS.INCIDENT_ESCALATED, expect.anything());
  });

  it('closes with an outcome: timeline note + outcome sent to the reporter', async () => {
    const { svc, prisma, redis } = setup();
    prisma.incident.findUnique.mockResolvedValue({ id: 'c1', status: 'OPEN', notes: [], referenceType: 'RIDE' });
    await svc.resolve('c1', 'RESOLVED', 'Marie K.', { outcome: 'CUSTOMER_PAID', comment: 'reçu vérifié' });
    const data = prisma.incident.update.mock.calls[0][0].data;
    expect(data.status).toBe('RESOLVED');
    expect(data.notes[0].text).toBe('Le client a payé — paiement confirmé — reçu vérifié');
    const payload = redis.publish.mock.calls.find((c: unknown[]) => c[0] === MOVA_EVENTS.INCIDENT_RESOLVED)?.[1];
    expect(payload.outcome).toBe('Le client a payé — paiement confirmé');
  });

  it('reopening clears the « pris en charge » and tells nobody', async () => {
    const { svc, prisma, redis } = setup();
    prisma.incident.findUnique.mockResolvedValue({ id: 'c1', status: 'RESOLVED', notes: [] });
    await svc.resolve('c1', 'OPEN', 'Marie K.');
    const data = prisma.incident.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'OPEN', resolvedAt: null, acknowledgedAt: null });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('an unknown status is stored as RESOLVED', async () => {
    const { svc, prisma } = setup();
    prisma.incident.findUnique.mockResolvedValue({ id: 'c1', status: 'OPEN', notes: [] });
    await svc.resolve('c1', 'WHATEVER');
    expect(prisma.incident.update.mock.calls[0][0].data.status).toBe('RESOLVED');
  });

  it('keeps at most 3 valid emergency contacts', async () => {
    const { svc, prisma } = setup();
    await expect(svc.setTrustedContacts('u1', [1, 2, 3, 4].map((n) => ({ name: `C${n}`, phone: `081234567${n}` })))).rejects.toThrow('Maximum 3');
    await expect(svc.setTrustedContacts('u1', [{ name: 'Maman', phone: '123' }])).rejects.toThrow('Numéro de contact invalide');
    await svc.setTrustedContacts('u1', [{ name: 'Maman', phone: '0812345678' }]);
    expect(prisma.trustedContact.create).toHaveBeenCalledWith({ data: { userId: 'u1', name: 'Maman', phone: '+243812345678' } });
  });
});
