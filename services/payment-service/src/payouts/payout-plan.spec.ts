import { planDriverPayout, planFoodSettlement, planRentalOwner } from './payout-plan';

/**
 * Balance tests: thousands of random jobs. For each, every party must end with exactly what it
 * is owed, nobody gets a negative amount, and SENGA's result is what is left (a negative result
 * is a SENGA-funded promo, recorded as a promo cost).
 */

// Small deterministic generator (same cases on every run, so a failure can be replayed).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const RUNS = 5000;

function amount(r: () => number, max = 500_000): number {
  const pick = r();
  if (pick < 0.05) return 0;
  if (pick < 0.1) return 1;
  return Math.round(r() * max);
}

function allNonNegative(obj: Record<string, number | number[]>) {
  for (const v of Object.values(obj)) {
    for (const n of Array.isArray(v) ? v : [v]) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  }
}

describe('planDriverPayout — balance on random jobs', () => {
  it('driver gets exactly the net, customer the refund, SENGA the rest', () => {
    const r = rng(42);
    for (let i = 0; i < RUNS; i++) {
      const net = amount(r);
      const paid = amount(r);
      const refund = r() < 0.3 ? amount(r, paid + 1000) : 0;
      const cash = r() < 0.5;
      const plan = planDriverPayout({ driverNetCdf: net, paidCdf: paid, refundCdf: refund, cash });
      allNonNegative(plan);
      const refundDue = Math.min(paid, refund);

      // Driver ends with the net: in cash they hold what was paid, hand back the refund,
      // pay their debt and receive any top-up.
      const driverEnds = cash
        ? paid - refundDue - plan.driverDebt + plan.driverPromoTopUp
        : plan.driverWalletCredit;
      expect(driverEnds).toBe(net);

      // Customer gets the refund (in cash, from the driver's hands).
      expect(cash ? refundDue : plan.customerRefundCredit).toBe(refundDue);

      // SENGA: commission (credited or owed) minus the promo it pays.
      const sengaEnds = plan.platformFeeCredit + plan.driverDebt - plan.promoCost;
      expect(sengaEnds).toBe(paid - refundDue - net);

      // Never both a commission and a promo cost on the same job.
      expect(Math.min(plan.platformFeeCredit + plan.driverDebt, plan.promoCost)).toBe(0);
    }
  });
});

describe('planFoodSettlement — balance on random food orders', () => {
  it('each restaurant and the courier get their net, SENGA the rest', () => {
    const r = rng(7);
    for (let i = 0; i < RUNS; i++) {
      const restaurantNets = Array.from({ length: 1 + Math.floor(r() * 3) }, () => amount(r, 200_000));
      const courierNet = amount(r, 30_000);
      const total = amount(r, 700_000);
      // As computed by ride-service: SENGA's commission is the residual, never below 0.
      const fee = Math.max(0, total - restaurantNets.reduce((a, b) => a + b, 0) - courierNet);
      const cash = r() < 0.5;
      const plan = planFoodSettlement({ totalPaidCdf: total, restaurantNets, courierNetCdf: courierNet, platformFeeCdf: fee, cash });
      allNonNegative(plan);

      restaurantNets.forEach((due, k) => {
        // Non-cash: credited by SENGA. Cash: the courier owes it and pays it at the counter.
        expect(cash ? plan.restaurantDebts[k] : plan.restaurantCredits[k]).toBe(due);
      });
      const owedByCourier = plan.restaurantDebts.reduce((a, b) => a + b, 0) + plan.platformDebt;
      const courierEnds = cash ? total - owedByCourier + plan.courierPromoTopUp : plan.courierWalletCredit;
      expect(courierEnds).toBe(courierNet);

      const sengaEnds = plan.platformFeeCredit + plan.platformDebt - plan.promoCost;
      expect(sengaEnds).toBe(total - restaurantNets.reduce((a, b) => a + b, 0) - courierNet);
    }
  });
});

describe('planRentalOwner — balance on random rentals', () => {
  it('owner gets the net, SENGA the rest', () => {
    const r = rng(99);
    for (let i = 0; i < RUNS; i++) {
      const paid = amount(r, 2_000_000);
      const ownerNet = amount(r, 2_000_000);
      const fee = Math.max(0, paid - ownerNet);
      const cash = r() < 0.5;
      const plan = planRentalOwner({ rentalPaidCdf: paid, ownerNetCdf: ownerNet, platformFeeCdf: fee, cash });
      allNonNegative(plan);
      const ownerEnds = cash ? paid - plan.ownerDebt + plan.ownerPromoTopUp : plan.ownerWalletCredit;
      expect(ownerEnds).toBe(ownerNet);
      expect(plan.platformFeeCredit + plan.ownerDebt - plan.promoCost).toBe(paid - ownerNet);
    }
  });
});
