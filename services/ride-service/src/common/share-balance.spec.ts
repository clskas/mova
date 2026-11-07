/**
 * Balance tests on random jobs for every share formula of ride-service. For each case:
 * nobody gets a negative amount, the parts add up, and a promo is paid only by whoever funds it.
 */
import { CommissionService } from '../rides/commission.service';
import { errandDriverNetCdf, rideDriverGrossCdf, rideShareBookingDriverGrossCdf } from './ride-driver-gross.util';
import { computeRentalPartnerDisplay } from '../billing/partner-display.util';
import { computeFoodShares } from '../deliveries/food-delivery-settlement.util';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const RUNS = 5000;
const amount = (r: () => number, max = 500_000) => (r() < 0.05 ? 0 : Math.round(r() * max));
const percent = (r: () => number) => (r() < 0.05 ? (r() < 0.5 ? -10 : 130) : Math.round(r() * 40));
const commission = new CommissionService({} as never);

describe('balance — commission split', () => {
  it('fee + net = gross, both ≥ 0, whatever the admin rate', () => {
    const r = rng(1);
    for (let i = 0; i < RUNS; i++) {
      const gross = amount(r);
      const s = commission.splitGross(gross, percent(r));
      expect(s.platformFeeCdf).toBeGreaterThanOrEqual(0);
      expect(s.driverNetCdf).toBeGreaterThanOrEqual(0);
      expect(s.platformFeeCdf + s.driverNetCdf).toBe(gross);
    }
  });
});

describe('balance — rides and Pool', () => {
  it('the driver is paid on the full price: a SENGA promo never lowers the driver gross', () => {
    const r = rng(2);
    for (let i = 0; i < RUNS; i++) {
      const fullPrice = amount(r);
      const promo = Math.min(fullPrice, amount(r, 50_000));
      const paid = fullPrice - promo;
      expect(rideDriverGrossCdf({ finalFareCdf: paid, discountCdf: promo })).toBe(fullPrice);
    }
  });

  it('Pool: the promo spread over the bookings adds back up', () => {
    const r = rng(3);
    for (let i = 0; i < RUNS; i++) {
      const n = 1 + Math.floor(r() * 4);
      const fares = Array.from({ length: n }, () => amount(r, 30_000));
      const promo = amount(r, 10_000);
      const total = fares.reduce((sum, f) => sum + rideShareBookingDriverGrossCdf(f, promo, n), 0);
      const expected = fares.reduce((a, b) => a + b, 0) + promo;
      // Rounding per booking: at most half a franc per booking.
      expect(Math.abs(total - expected)).toBeLessThanOrEqual(n);
    }
  });
});

describe('balance — errands', () => {
  it('purchases are always paid back in full; commission only on the fee', () => {
    const r = rng(4);
    for (let i = 0; i < RUNS; i++) {
      const fee = amount(r, 50_000);
      const purchases = amount(r);
      const pct = percent(r);
      const net = errandDriverNetCdf(fee, purchases, pct);
      expect(net).toBeGreaterThanOrEqual(purchases);
      expect(net - purchases).toBe(commission.splitGross(fee, pct).driverNetCdf);
    }
  });
});

describe('balance — rentals', () => {
  it('owner + SENGA − SENGA promo = paid; the owner bears only their own promo', () => {
    const r = rng(5);
    for (let i = 0; i < RUNS; i++) {
      const fullPrice = amount(r, 2_000_000);
      const discount = Math.min(fullPrice, amount(r, 300_000));
      const partnerPart = r() < 0.33 ? discount : r() < 0.5 ? 0 : Math.round(discount * r());
      const deposit = amount(r, 300_000);
      const pct = Math.round(r() * 30);
      const paid = fullPrice - discount;
      const d = computeRentalPartnerDisplay({
        totalCdf: paid + deposit,
        depositCdf: deposit,
        discountCdf: discount,
        partnerDiscountCdf: partnerPart,
        platformPercent: pct,
      });
      expect(d.partnerNetCdf).toBeGreaterThanOrEqual(0);
      expect(d.platformFeeCdf).toBeGreaterThanOrEqual(0);
      const commissionCdf = Math.ceil(fullPrice * (pct / 100));
      // Owner: full price − commission − own promo (never the SENGA part).
      expect(d.partnerNetCdf).toBe(Math.max(0, fullPrice - commissionCdf - partnerPart));
      const promoCost = Math.max(0, d.partnerNetCdf - paid);
      expect(d.partnerNetCdf + d.platformFeeCdf - promoCost).toBe(paid);
    }
  });
});

describe('balance — food orders', () => {
  it('restaurants + courier + SENGA − SENGA promo = paid; the courier never pays a promo', () => {
    const r = rng(6);
    for (let i = 0; i < RUNS; i++) {
      const restaurants = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => ({
        restaurantId: `r${k}`,
        itemsGrossCdf: amount(r, 150_000),
      }));
      const markup = r() < 0.7;
      const foodPercent = percent(r);
      const deliveryPercent = percent(r);
      const deliveryFee = amount(r, 20_000);
      const itemsCustomer = restaurants.reduce(
        (sum, x) => sum + x.itemsGrossCdf + (markup ? Math.round(x.itemsGrossCdf * 0.12) : 0),
        0,
      );
      const promo = Math.min(itemsCustomer + deliveryFee, amount(r, 40_000));
      const partnerPromo = r() < 0.5 ? 0 : Math.round(promo * r());
      const total = itemsCustomer + deliveryFee - promo;
      const hasCourier = r() < 0.9;
      const s = computeFoodShares({
        totalPaidCdf: total,
        restaurants,
        catalogMarkupModel: markup,
        foodPercent,
        deliveryPercent,
        partnerDiscountCdf: partnerPromo,
        discountRestaurantId: 'r0',
        deliveryFeeGrossCdf: deliveryFee,
        hasCourier,
      });
      for (const x of s.restaurants) expect(x.netCdf).toBeGreaterThanOrEqual(0);
      expect(s.courierNetCdf).toBeGreaterThanOrEqual(0);
      expect(s.platformFeeCdf).toBeGreaterThanOrEqual(0);
      // Courier: the delivery fee minus the DELIVERY commission, whatever the promo.
      expect(s.courierNetCdf).toBe(hasCourier ? commission.splitGross(deliveryFee, deliveryPercent).driverNetCdf : 0);
      const restaurantsNet = s.restaurants.reduce((sum, x) => sum + x.netCdf, 0);
      const promoCost = Math.max(0, restaurantsNet + s.courierNetCdf - total);
      expect(restaurantsNet + s.courierNetCdf + s.platformFeeCdf - promoCost).toBe(total);
    }
  });
});
