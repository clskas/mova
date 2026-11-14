import { haversineKm, normalizeAutomations, rideFitsDriverDestination, ussdSteps } from './automations';

describe('growth lot 2', () => {
  const gombe = { lat: -4.305, lng: 15.31 };
  const limete = { lat: -4.36, lng: 15.35 };
  const masina = { lat: -4.39, lng: 15.4 };

  it('distance in km', () => {
    expect(haversineKm(gombe.lat, gombe.lng, gombe.lat, gombe.lng)).toBe(0);
    expect(haversineKm(gombe.lat, gombe.lng, limete.lat, limete.lng)).toBeGreaterThan(6);
  });

  it('driver heading home only takes rides that bring him closer', () => {
    // driver in Gombe going home to Masina
    expect(rideFitsDriverDestination(gombe, masina, limete, 3)).toBe(true);
    expect(rideFitsDriverDestination(limete, masina, gombe, 3)).toBe(false);
    expect(rideFitsDriverDestination(gombe, masina, { lat: -4.392, lng: 15.402 }, 3)).toBe(true);
  });

  it('USSD input split into steps', () => {
    expect(ussdSteps('')).toEqual([]);
    expect(ussdSteps('1*Gombe*Limete*1')).toEqual(['1', 'Gombe', 'Limete', '1']);
  });

  it('lot 2 switches off by default', () => {
    const a = normalizeAutomations({});
    expect([a.ussdBooking.enabled, a.whatsappBooking.enabled, a.driverDestination.enabled, a.tripInsurance.enabled, a.familyMode.enabled]).toEqual([false, false, false, false, false]);
    expect(normalizeAutomations({ tripInsurance: { feeCdf: 5 } }).tripInsurance.feeCdf).toBe(50);
  });
});
