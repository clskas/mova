/** Flags séquestre location : prépaiement à CONFIRMED, libération au retour. */
export function computeRentalEscrowFlags(params: {
  status: string;
  isPaid?: boolean;
  escrowHeld?: boolean;
  payoutReleased?: boolean;
  fundsFrozen?: boolean;
}) {
  const status = (params.status ?? '').toUpperCase();
  const escrowHeld = Boolean(params.escrowHeld) && !Boolean(params.payoutReleased);
  const fullyPaid =
    status === 'PAID' ||
    Boolean(params.payoutReleased) ||
    (Boolean(params.isPaid) && !Boolean(params.escrowHeld));
  const frozen = Boolean(params.fundsFrozen);
  const escrowCollect = status === 'CONFIRMED' && !escrowHeld && !fullyPaid && !frozen;
  /** Anciennes locations post-retour sans séquestre. */
  const legacyReturnPay = status === 'RETURNED' && !fullyPaid && !escrowHeld && !frozen;
  return {
    escrowHeld,
    fullyPaid,
    escrowCollect,
    paymentReady: escrowCollect || legacyReturnPay,
    cashAllowed: legacyReturnPay,
  };
}

/**
 * Deposit of a booking = the amount charged when it was booked (never the vehicle's current
 * deposit, which the owner may change afterwards). Older bookings without the snapshot: the
 * vehicle's deposit, never more than what the customer was charged.
 */
export function rentalBookingDepositCdf(inquiry: {
  bookedDepositCdf?: number | null;
  totalCdf?: number | null;
  estimatedPriceCdf?: number | null;
  vehicle?: { depositCdf?: number | null } | null;
}): number {
  if (inquiry.bookedDepositCdf != null) return Math.max(0, Math.round(inquiry.bookedDepositCdf));
  const charged = Math.max(0, Math.round(inquiry.totalCdf ?? inquiry.estimatedPriceCdf ?? 0));
  return Math.max(0, Math.min(Math.round(inquiry.vehicle?.depositCdf ?? 0), charged));
}
