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

  it('follows the delays set by the super-admin', () => {
    const c = {
      enabled: true,
      reminder1Min: 10,
      driverCheckMin: 60,
      reminder2Min: 180,
      autoDisputeEnabled: true,
      autoDisputeHours: 48,
    };
    expect(nextUnpaidStep(6, new Set(), c)).toBeNull();
    expect(nextUnpaidStep(11, new Set(), c)).toBe('UNPAID_REMINDER_1');
    expect(nextUnpaidStep(24 * 60 + 1, new Set(['UNPAID_REMINDER_1', 'UNPAID_DRIVER_CHECK', 'UNPAID_REMINDER_2']), c)).toBeNull();
    expect(nextUnpaidStep(48 * 60, new Set(['UNPAID_REMINDER_1', 'UNPAID_DRIVER_CHECK', 'UNPAID_REMINDER_2']), c)).toBe(
      'UNPAID_AUTO_DISPUTE',
    );
  });

  it('no automatic dispute when it is switched off', () => {
    const c = {
      enabled: true,
      reminder1Min: 5,
      driverCheckMin: 30,
      reminder2Min: 120,
      autoDisputeEnabled: false,
      autoDisputeHours: 24,
    };
    expect(nextUnpaidStep(25 * 60, new Set(['UNPAID_REMINDER_1', 'UNPAID_DRIVER_CHECK', 'UNPAID_REMINDER_2']), c)).toBeNull();
  });
});
