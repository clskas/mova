import { anomalyFor } from './automations.scheduler';
import { DEFAULT_AUTOMATIONS, normalizeAutomations } from '@mova/shared';

describe('automations', () => {
  const cfg = { minRequestsPerHour: 10, cancelRatePct: 60, unservedPerHour: 5 };

  it('flags a cancellation spike only with enough requests', () => {
    expect(anomalyFor({ requests: 5, cancelled: 5, unserved: 0 }, cfg)).toEqual([]);
    expect(anomalyFor({ requests: 10, cancelled: 7, unserved: 0 }, cfg)[0]).toContain('70 %');
    expect(anomalyFor({ requests: 10, cancelled: 5, unserved: 0 }, cfg)).toEqual([]);
  });

  it('flags passengers left without a driver', () => {
    expect(anomalyFor({ requests: 3, cancelled: 0, unserved: 5 }, cfg)).toEqual(['5 passager(s) sans chauffeur']);
  });

  it('normalises the admin settings (missing values, bounds)', () => {
    expect(normalizeAutomations(undefined)).toEqual(DEFAULT_AUTOMATIONS);
    const n = normalizeAutomations({ dailyReport: { hourKinshasa: 30 }, docExpiry: { daysBefore: [1, 30, 30, -2] } });
    expect(n.dailyReport.hourKinshasa).toBe(23);
    expect(n.docExpiry.daysBefore).toEqual([30, 1]);
    expect(n.cashDebt.blockAfterDays).toBe(0);
  });
});
