import { bonusForJobs, DEFAULT_AUTOMATIONS, normalizeAutomations } from '@mova/shared';
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

  it('heat map: cell size set in the admin (bigger cells merge more requests)', () => {
    const pts = [
      { lat: -4.32, lng: 15.31, waiting: false },
      { lat: -4.33, lng: 15.31, waiting: false }, // ~1.1 km apart
    ];
    expect(heatCells(pts, 1.1 / 111)).toHaveLength(2); // ~1.1 km cells
    expect(heatCells(pts, 5 / 111)).toHaveLength(1); // ~5 km cells
  });

  it('demand zones settings: defaults and bounds', () => {
    expect(DEFAULT_AUTOMATIONS.demandHeatmap).toMatchObject({ radiusKm: 17, cellMeters: 1100 });
    const n = normalizeAutomations({ demandHeatmap: { radiusKm: 500, cellMeters: 10 } });
    expect(n.demandHeatmap.radiusKm).toBe(50);
    expect(n.demandHeatmap.cellMeters).toBe(200);
    expect(normalizeAutomations({ demandHeatmap: { radiusKm: 5 } }).demandHeatmap.radiusKm).toBe(5);
  });
});
