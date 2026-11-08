import { dayRangeFilter, parseDayBoundary } from './date-range';

describe('date-range', () => {
  it('reads a calendar day as the whole Kinshasa day', () => {
    expect(parseDayBoundary('2026-11-08', 'start')?.toISOString()).toBe('2026-11-07T23:00:00.000Z');
    expect(parseDayBoundary('2026-11-08', 'end')?.toISOString()).toBe('2026-11-08T22:59:59.999Z');
  });

  it('keeps full timestamps and Date objects as they are', () => {
    expect(parseDayBoundary('2026-11-08T10:00:00.000Z', 'end')?.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    const d = new Date('2026-01-01T00:00:00Z');
    expect(parseDayBoundary(d, 'start')).toBe(d);
  });

  it('ignores empty or invalid values', () => {
    expect(parseDayBoundary('', 'start')).toBeUndefined();
    expect(parseDayBoundary('pas une date', 'end')).toBeUndefined();
    expect(dayRangeFilter(undefined, 'n/a')).toBeUndefined();
  });

  it('a same-day range includes an order placed that afternoon', () => {
    const range = dayRangeFilter('2026-11-08', '2026-11-08')!;
    const order = new Date('2026-11-08T14:30:00+01:00');
    expect(order >= range.gte! && order <= range.lte!).toBe(true);
  });
});
