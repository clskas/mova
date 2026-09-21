import { computeRentalEscrowFlags } from './rental-escrow.util';

describe('computeRentalEscrowFlags', () => {
  it('demande le séquestre à CONFIRMED', () => {
    const flags = computeRentalEscrowFlags({ status: 'CONFIRMED' });
    expect(flags.escrowCollect).toBe(true);
    expect(flags.paymentReady).toBe(true);
    expect(flags.cashAllowed).toBe(false);
    expect(flags.escrowHeld).toBe(false);
  });

  it('bloque le collect une fois séquestré', () => {
    const flags = computeRentalEscrowFlags({
      status: 'CONFIRMED',
      isPaid: true,
      escrowHeld: true,
    });
    expect(flags.escrowCollect).toBe(false);
    expect(flags.paymentReady).toBe(false);
    expect(flags.escrowHeld).toBe(true);
    expect(flags.fullyPaid).toBe(false);
  });

  it('considère payé après libération', () => {
    const flags = computeRentalEscrowFlags({
      status: 'RETURNED',
      isPaid: true,
      escrowHeld: true,
      payoutReleased: true,
    });
    expect(flags.escrowHeld).toBe(false);
    expect(flags.fullyPaid).toBe(true);
    expect(flags.paymentReady).toBe(false);
  });

  it('autorise le paiement espèces legacy au retour', () => {
    const flags = computeRentalEscrowFlags({ status: 'RETURNED' });
    expect(flags.paymentReady).toBe(true);
    expect(flags.cashAllowed).toBe(true);
  });
});
