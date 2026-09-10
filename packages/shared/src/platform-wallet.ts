/** Compte trésorerie SENGA (ledger payment-service) — commissions + recharges Mobile Money. */
export const MOVA_PLATFORM_USER_ID = '00000000-0000-4000-8000-mova00000001';

export const MOVA_PLATFORM_WALLET_LABEL = 'SENGA Platform Treasury';

/** Idempotent ledger reference for reversing admin virtual float on the platform wallet. */
export const REVERSE_VIRTUAL_TREASURY_FLOAT_REF = 'reverse_virtual_treasury_float_v1';

/**
 * One-shot prod clear of the 3000 FC admin apport (2026-09-10).
 * Treated as already-applied alongside {@link REVERSE_VIRTUAL_TREASURY_FLOAT_REF}.
 */
export const ADMIN_CLEAR_VIRTUAL_APPORT_3000_REF = 'admin_clear_virtual_apport_3000_v1';
