import { hourInWindow, marketHourNow } from './pricing-time-window.util';

describe('pricing-time-window.util', () => {
  it('hourInWindow — plage même jour', () => {
    expect(hourInWindow(8, 7, 9)).toBe(true);
    expect(hourInWindow(7, 7, 9)).toBe(true);
    expect(hourInWindow(9, 7, 9)).toBe(false);
    expect(hourInWindow(6, 7, 9)).toBe(false);
  });

  it('hourInWindow — plage overnight', () => {
    expect(hourInWindow(23, 22, 5)).toBe(true);
    expect(hourInWindow(3, 22, 5)).toBe(true);
    expect(hourInWindow(5, 22, 5)).toBe(false);
    expect(hourInWindow(12, 22, 5)).toBe(false);
  });

  it('marketHourNow utilise le fuseau Kinshasa', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T07:00:00Z')); // 08:00 à Kinshasa (UTC+1)
    expect(marketHourNow('Africa/Kinshasa')).toBe(8);
    jest.useRealTimers();
  });

  it('marketHourNow utilise le fuseau Lubumbashi (UTC+2)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T06:00:00Z')); // 08:00 à Lubumbashi (UTC+2)
    expect(marketHourNow('Africa/Lubumbashi')).toBe(8);
    jest.useRealTimers();
  });
});
