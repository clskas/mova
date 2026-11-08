import { incidentNotifiesReporter, incidentStatusForOutcome } from './incidents';

describe('incidents', () => {
  it('a fraud alert never notifies the person it is about', () => {
    expect(incidentNotifiesReporter({ type: 'FRAUD', referenceType: 'FRAUD_AUTO' })).toBe(false);
    expect(incidentNotifiesReporter({ type: 'CASH_NOT_RECEIVED', referenceType: 'RIDE' })).toBe(true);
    expect(incidentNotifiesReporter({ type: 'SOS' })).toBe(true);
  });

  it('false positive and « sans suite » are DISMISSED, the rest RESOLVED', () => {
    expect(incidentStatusForOutcome('FALSE_POSITIVE')).toBe('DISMISSED');
    expect(incidentStatusForOutcome('NO_ACTION')).toBe('DISMISSED');
    expect(incidentStatusForOutcome('CUSTOMER_PAID')).toBe('RESOLVED');
    expect(incidentStatusForOutcome(undefined)).toBe('RESOLVED');
  });
});
