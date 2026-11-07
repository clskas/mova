/**
 * Who gets what for one paid job — pure functions, no database. The payout services apply
 * these plans; the balance tests (payout-plan.spec.ts) check them on thousands of random cases.
 *
 * Rule for every plan: each party ends with exactly what it is owed, and SENGA ends with
 * (what the customer paid − refunds − what the others are owed). When that is negative,
 * SENGA pays the difference (a promo it funds) and records it as a promo cost.
 */

const int = (v: number | null | undefined) => (Number.isFinite(v as number) ? Math.round(v as number) : 0);
const pos = (v: number | null | undefined) => Math.max(0, int(v));

export type DriverPayoutPlan = {
  /** Paid by card / wallet / Mobile Money: the driver's net goes to the driver's wallet. */
  driverWalletCredit: number;
  /** Paid in cash with a SENGA promo bigger than the commission: SENGA tops the driver up. */
  driverPromoTopUp: number;
  /** Commission credited to the SENGA treasury (non-cash). */
  platformFeeCredit: number;
  /** Commission the driver owes SENGA (cash: the money is in the driver's hands). */
  driverDebt: number;
  /** Part of a SENGA promo paid out of the treasury. */
  promoCost: number;
  /** Money given back to the customer's wallet (non-cash; in cash the driver hands it back). */
  customerRefundCredit: number;
};

export function planDriverPayout(input: {
  driverNetCdf: number;
  paidCdf: number;
  refundCdf?: number;
  cash: boolean;
}): DriverPayoutPlan {
  const net = pos(input.driverNetCdf);
  const paid = pos(input.paidCdf);
  const refund = Math.min(paid, pos(input.refundCdf));
  const collected = paid - refund;
  const commission = Math.max(0, collected - net);
  const shortfall = Math.max(0, net - collected);
  return {
    driverWalletCredit: input.cash ? 0 : net,
    driverPromoTopUp: input.cash ? shortfall : 0,
    platformFeeCredit: input.cash ? 0 : commission,
    driverDebt: input.cash ? commission : 0,
    promoCost: shortfall,
    customerRefundCredit: input.cash ? 0 : refund,
  };
}

export type FoodSettlementPlan = {
  restaurantCredits: number[];
  courierWalletCredit: number;
  /** Cash: shares the courier owes (one per restaurant) and the SENGA commission. */
  restaurantDebts: number[];
  platformDebt: number;
  platformFeeCredit: number;
  courierPromoTopUp: number;
  promoCost: number;
};

/** Food order: restaurants (one or more), the courier, SENGA. */
export function planFoodSettlement(input: {
  totalPaidCdf: number;
  restaurantNets: number[];
  courierNetCdf: number;
  platformFeeCdf: number;
  cash: boolean;
}): FoodSettlementPlan {
  const total = pos(input.totalPaidCdf);
  const restaurants = input.restaurantNets.map(pos);
  const courier = pos(input.courierNetCdf);
  const fee = pos(input.platformFeeCdf);
  const owedToOthers = restaurants.reduce((a, b) => a + b, 0) + courier;
  const shortfall = Math.max(0, owedToOthers - total);
  return {
    restaurantCredits: input.cash ? restaurants.map(() => 0) : restaurants,
    courierWalletCredit: input.cash ? 0 : courier,
    restaurantDebts: input.cash ? restaurants : restaurants.map(() => 0),
    platformDebt: input.cash ? fee : 0,
    platformFeeCredit: input.cash ? 0 : fee,
    courierPromoTopUp: input.cash ? shortfall : 0,
    promoCost: shortfall,
  };
}

export type RentalOwnerPlan = {
  ownerWalletCredit: number;
  ownerDebt: number;
  platformFeeCredit: number;
  ownerPromoTopUp: number;
  promoCost: number;
};

/** Rental (deposit excluded): the owner and SENGA. */
export function planRentalOwner(input: {
  rentalPaidCdf: number;
  ownerNetCdf: number;
  platformFeeCdf: number;
  cash: boolean;
}): RentalOwnerPlan {
  const paid = pos(input.rentalPaidCdf);
  const owner = pos(input.ownerNetCdf);
  const fee = pos(input.platformFeeCdf);
  const shortfall = Math.max(0, owner - paid);
  return {
    ownerWalletCredit: input.cash ? 0 : owner,
    ownerDebt: input.cash ? fee : 0,
    platformFeeCredit: input.cash ? 0 : fee,
    ownerPromoTopUp: input.cash ? shortfall : 0,
    promoCost: shortfall,
  };
}
