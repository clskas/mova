import { faceCheckedToday } from './face-check.service';

describe('face check', () => {
  it('counts only a check made today (Kinshasa)', () => {
    const now = new Date('2026-11-14T10:00:00Z');
    expect(faceCheckedToday(new Date('2026-11-14T06:00:00Z'), now)).toBe(true);
    expect(faceCheckedToday(new Date('2026-11-13T21:00:00Z'), now)).toBe(false);
    expect(faceCheckedToday(null, now)).toBe(false);
  });
});
