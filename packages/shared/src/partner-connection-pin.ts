export type PartnerConnectionPinMode = 'setup' | 'enter' | null;

const SEED_DEMO_PHONE_RE = /^\+2439000000\d{2}$/;

export function partnerKycIsApproved(status?: string | null, canOperate?: boolean): boolean {
  if (canOperate === true) return true;
  return String(status ?? '').trim().toUpperCase() === 'APPROVED';
}

/**
 * Restaurant / rental: confirm the 6-digit login PIN issued at KYC (issueLoginPin).
 * Not SENGA Driver. Not a create-PIN screen. Not Google OTP.
 *
 * Show `enter` when the PIN exists (`pinConfigured`), even if profile.kycStatus is
 * still PENDING. Before a PIN exists, return null so the dossier can be completed.
 */
export function partnerConnectionPinMode(opts: {
  pinConfigured?: boolean;
  kycStatus?: string | null;
  canOperate?: boolean;
  unlocked: boolean;
  identity?: string;
}): PartnerConnectionPinMode {
  if (opts.unlocked) return null;
  const id = (opts.identity ?? '').trim();
  if (SEED_DEMO_PHONE_RE.test(id)) return null;
  if (opts.pinConfigured === true) return 'enter';
  if (opts.pinConfigured === false) return null;
  if (partnerKycIsApproved(opts.kycStatus, opts.canOperate)) return 'enter';
  return null;
}

export function partnerNeedsKycActivationPin(opts: {
  pinConfigured?: boolean;
  kycStatus?: string | null;
  canOperate?: boolean;
  unlocked: boolean;
  identity?: string;
}): boolean {
  return partnerConnectionPinMode(opts) === 'enter';
}

/**
 * After admin KYC approval: blocking « Code PIN d'activation » (resto/location).
 * Separate from login PIN, even when both are the same issueLoginPin value.
 */
export function partnerNeedsWorkActivationPin(opts: {
  kycStatus?: string | null;
  activationPinVerified?: boolean;
  identity?: string;
}): boolean {
  const id = (opts.identity ?? '').trim();
  if (SEED_DEMO_PHONE_RE.test(id)) return false;
  if (opts.activationPinVerified === true) return false;
  return String(opts.kycStatus ?? '').trim().toUpperCase() === 'APPROVED';
}
