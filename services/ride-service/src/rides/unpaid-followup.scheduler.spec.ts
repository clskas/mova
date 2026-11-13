import { nextUnpaidStep } from './unpaid-followup.scheduler';

describe('unpaid ride follow-up steps', () => {
  it('reminder at 5 min, driver at 30 min, SMS reminder at 2 h, dispute at 24 h', () => {
    expect(nextUnpaidStep(3, new Set())).toBeNull();
    expect(nextUnpaidStep(6, new Set())).toBe('UNPAID_REMINDER_1');
    expect(nextUnpaidStep(31, new Set(['UNPAID_REMINDER_1']))).toBe('UNPAID_DRIVER_CHECK');
    expect(nextUnpaidStep(125, new Set(['UNPAID_REMINDER_1', 'UNPAID_DRIVER_CHECK']))).toBe('UNPAID_REMINDER_2');
    expect(nextUnpaidStep(24 * 60 + 1, new Set(['UNPAID_REMINDER_1', 'UNPAID_DRIVER_CHECK', 'UNPAID_REMINDER_2']))).toBe('UNPAID_AUTO_DISPUTE');
  });

  it('nothing twice, and a ride found late gets only the latest step', () => {
    expect(nextUnpaidStep(10, new Set(['UNPAID_REMINDER_1']))).toBeNull();
    expect(nextUnpaidStep(180, new Set())).toBe('UNPAID_REMINDER_2');
  });
});
