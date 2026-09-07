import { isPlayPrelaunchAccount, isSeedDemoPhone } from '@mova/shared';

export type AdminDriverUser = {
  id?: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type AdminDriverVisibility = {
  hidden: boolean;
  reason: 'orphan' | 'play_prelaunch' | 'seed_demo' | 'leftover' | null;
  userRole?: string | null;
};

/**
 * Chauffeurs admin must not contradict Utilisateurs:
 * hide Test Lab / seed demo, orphan profiles, and leftover KYC shells
 * that are not a real DRIVER account.
 */
export function classifyAdminDriver(
  user: AdminDriverUser | null | undefined,
  opts: { onboardingCompleted?: boolean; kycDocumentsUploaded?: number },
): AdminDriverVisibility {
  if (!user?.id) return { hidden: true, reason: 'orphan', userRole: null };
  if (isPlayPrelaunchAccount(user)) {
    return { hidden: true, reason: 'play_prelaunch', userRole: user.role };
  }
  if (user.phone && isSeedDemoPhone(user.phone)) {
    return { hidden: true, reason: 'seed_demo', userRole: user.role };
  }
  const realDriverWork =
    user.role === 'DRIVER' ||
    opts.onboardingCompleted === true ||
    (opts.kycDocumentsUploaded ?? 0) > 0;
  if (!realDriverWork) {
    return { hidden: true, reason: 'leftover', userRole: user.role };
  }
  return { hidden: false, reason: null, userRole: user.role };
}
