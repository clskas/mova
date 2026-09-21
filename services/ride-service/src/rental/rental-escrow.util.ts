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
