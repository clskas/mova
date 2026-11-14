import { eventMultiplier, maintenanceMilestone, normalizeAutomations, operatorDegraded, parseSurgeEvents } from './automations';

describe('automations lot 6', () => {
  it('admin events: one per line, Kinshasa time by default', () => {
    const ev = parseSurgeEvents('Kinshasa;Match;2026-12-01T16:00;2026-12-01T22:00;1.3\nmauvaise ligne\nGoma;Fête;2026-12-24T18:00;2026-12-25T02:00;5');
    expect(ev).toHaveLength(2);
    expect(ev[1].multiplier).toBe(2);
    expect(eventMultiplier(ev, 'kinshasa', new Date('2026-12-01T17:00:00+01:00'))).toBe(1.3);
    expect(eventMultiplier(ev, 'Kinshasa', new Date('2026-12-01T23:00:00+01:00'))).toBe(1);
    expect(eventMultiplier(ev, 'Lubumbashi', new Date('2026-12-01T17:00:00+01:00'))).toBe(1);
  });

  it('operator failing only with enough attempts', () => {
    const cfg = { minAttempts: 10, failRatePct: 50 };
    expect(operatorDegraded(5, 0, cfg)).toBe(false);
    expect(operatorDegraded(10, 4, cfg)).toBe(true);
    expect(operatorDegraded(10, 6, cfg)).toBe(false);
  });

  it('maintenance milestone crossed', () => {
    expect(maintenanceMilestone(4900, 5100, 5000)).toBe(5000);
    expect(maintenanceMilestone(5100, 5200, 5000)).toBe(0);
    expect(maintenanceMilestone(9000, 15500, 5000)).toBe(15000);
  });

  it('every lot 6 switch is off by default', () => {
    const a = normalizeAutomations({});
    const keys = ['rideRescue', 'driverCallout', 'abandonedBooking', 'winBack', 'weatherEvents', 'fraudWatch', 'ledgerCheck', 'operatorWatch', 'autoCompensation', 'lowRatingTicket', 'onboardingReminders', 'autoPayouts', 'statements', 'maintenanceReminder'] as const;
    for (const k of keys) expect(a[k].enabled).toBe(false);
    expect(normalizeAutomations({ weatherEvents: { rainMultiplier: 9 } }).weatherEvents.rainMultiplier).toBe(2);
  });
});
