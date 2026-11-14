import { bonusForJobs, DEFAULT_AUTOMATIONS } from '@mova/shared';
import { heatCells } from './driver-incentives.service';

describe('driver incentives', () => {
  const b = { ...DEFAULT_AUTOMATIONS.driverBonus, enabled: true };

  it('bonus: highest tier reached, nothing when off', () => {
    expect(bonusForJobs(9, b)).toBe(0);
    expect(bonusForJobs(10, b)).toBe(5000);
    expect(bonusForJobs(25, b)).toBe(12000);
    expect(bonusForJobs(25, { ...b, enabled: false })).toBe(0);
  });

  it('heat map: groups nearby requests, waiting ones first', () => {
    const cells = heatCells([
      { lat: -4.3011, lng: 15.3112, waiting: false },
      { lat: -4.3014, lng: 15.3109, waiting: true },
      { lat: -4.35, lng: 15.25, waiting: false },
    ]);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ count: 2, waiting: 1 });
  });
});
