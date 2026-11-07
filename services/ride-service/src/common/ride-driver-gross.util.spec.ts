import { errandDriverNetCdf, rideDriverGrossCdf, rideShareBookingDriverGrossCdf } from './ride-driver-gross.util';

describe('rideDriverGrossCdf', () => {
  it('sans promo = prix passager', () => {
    expect(rideDriverGrossCdf({ estimatedFareCdf: 10000, discountCdf: 0 })).toBe(10000);
    expect(rideDriverGrossCdf({ estimatedFareCdf: 10000 })).toBe(10000);
  });

  it('promo plateforme : chauffeur sur tarif plein', () => {
    // Passager paie 9000, remise 1000 → chauffeur sur 10000
    expect(rideDriverGrossCdf({ estimatedFareCdf: 9000, discountCdf: 1000 })).toBe(10000);
    expect(rideDriverGrossCdf({ finalFareCdf: 8500, estimatedFareCdf: 9000, discountCdf: 1500 })).toBe(10000);
  });
});

describe('rideShareBookingDriverGrossCdf', () => {
  it('répartit la remise entre les bookings', () => {
    expect(rideShareBookingDriverGrossCdf(5000, 1000, 2)).toBe(5500);
    expect(rideShareBookingDriverGrossCdf(5000, 0, 2)).toBe(5000);
  });
});

describe('errandDriverNetCdf', () => {
  it('takes the commission on the fee only and pays the purchases back in full', () => {
    // fee 5 000 at 15 % → 4 250 ; purchases 50 000 back in full
    expect(errandDriverNetCdf(5000, 50000, 15)).toBe(54250);
  });
  it('works without purchases', () => {
    expect(errandDriverNetCdf(5000, null, 15)).toBe(4250);
  });
});
