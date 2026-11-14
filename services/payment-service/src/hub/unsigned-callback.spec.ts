import { unsignedCallbackTooLate } from './hub-payments.service';
import { filterDriversForCustomer } from '@mova/shared';

describe('security audit fixes', () => {
  it('unsigned aggregator success only within 6 hours', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(unsignedCallbackTooLate(new Date('2026-11-14T10:00:00Z'), now)).toBe(false);
    expect(unsignedCallbackTooLate(new Date('2026-11-14T05:00:00Z'), now)).toBe(true);
  });

  it('demo accounts never meet real customers', () => {
    const demo = new Set(['demo-driver', 'demo-passenger']);
    const drivers = [{ userId: 'real-driver' }, { userId: 'demo-driver' }];
    expect(filterDriversForCustomer(drivers, 'real-passenger', demo).map((d) => d.userId)).toEqual(['real-driver']);
    expect(filterDriversForCustomer(drivers, 'demo-passenger', demo).map((d) => d.userId)).toEqual(['demo-driver']);
  });
});
