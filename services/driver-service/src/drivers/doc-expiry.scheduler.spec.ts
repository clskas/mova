import { daysLeft } from './doc-expiry.scheduler';

describe('document expiry', () => {
  it('counts whole days left', () => {
    const now = new Date('2026-11-14T08:00:00Z');
    expect(daysLeft(new Date('2026-11-21T09:00:00Z'), now)).toBe(7);
    expect(daysLeft(new Date('2026-11-14T20:00:00Z'), now)).toBe(0);
  });
});
