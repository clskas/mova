import { isAdminHiddenPlayAccount, isSeedDemoPhone } from '@mova/shared';

export type AdminDriverUser = {
  id?: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type AdminDriverAuthLookup = 'ok' | 'not_found' | 'unavailable';

export type AdminDriverVisibility = {
  hidden: boolean;
  reason: 'orphan' | 'play_prelaunch' | 'seed_demo' | 'leftover' | null;
  userRole?: string | null;
};

function hasRealDriverWork(opts: {
  onboardingCompleted?: boolean;
  kycDocumentsUploaded?: number;
  kycStatus?: string | null;
}): boolean {
  return (
    opts.onboardingCompleted === true ||
    (opts.kycDocumentsUploaded ?? 0) > 0 ||
    String(opts.kycStatus ?? '').toUpperCase() === 'APPROVED'
  );
}

/**
 * Chauffeurs admin must not contradict Utilisateurs:
 * hide Test Lab / seed demo, true orphans (auth 404), and leftover KYC shells
 * that are not a real DRIVER account.
 *
 * Auth HTTP/network failures must NOT hide real dossiers (fail-open) — otherwise
 * « Aucun chauffeur enregistré » when AUTH_SERVICE_URL is down / misconfigured.
 */
export function classifyAdminDriver(
  user: AdminDriverUser | null | undefined,
  opts: {
    onboardingCompleted?: boolean;
    kycDocumentsUploaded?: number;
    kycStatus?: string | null;
    authLookup?: AdminDriverAuthLookup;
  },
): AdminDriverVisibility {
  const authLookup = opts.authLookup ?? (user?.id ? 'ok' : 'not_found');

  if (authLookup === 'unavailable') {
    // Auth unreachable: show profiles with real KYC / onboarding so admin stays usable.
    if (hasRealDriverWork(opts)) {
      return { hidden: false, reason: null, userRole: user?.role ?? null };
    }
    return { hidden: true, reason: 'orphan', userRole: null };
  }

  if (authLookup === 'not_found' || !user?.id) {
    return { hidden: true, reason: 'orphan', userRole: null };
  }

  // DRIVER (and partners) with Google / no +243: only hide official Test Lab,
  // not personal Gmail like afriri75@gmail.com.
  if (isAdminHiddenPlayAccount(user)) {
    return { hidden: true, reason: 'play_prelaunch', userRole: user.role };
  }
  if (user.phone && isSeedDemoPhone(user.phone)) {
    return { hidden: true, reason: 'seed_demo', userRole: user.role };
  }
  const realDriverWork = user.role === 'DRIVER' || hasRealDriverWork(opts);
  if (!realDriverWork) {
    return { hidden: true, reason: 'leftover', userRole: user.role };
  }
  return { hidden: false, reason: null, userRole: user.role };
}
