import { isOfficialPlayTestLabAccount } from '@mova/shared';

export type AdminPartnerUser = {
  id?: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type AdminPartnerVisibility = {
  hidden: boolean;
  reason: 'orphan' | 'play_prelaunch' | null;
  userRole?: string | null;
};

/**
 * Partner KYC must match Utilisateurs: hide Test Lab crawlers and profiles
 * without an auth User. Real restaurant / rental Google accounts stay visible.
 */
export function classifyAdminPartner(user: AdminPartnerUser | null | undefined): AdminPartnerVisibility {
  if (!user?.id) return { hidden: true, reason: 'orphan', userRole: null };
  if (isOfficialPlayTestLabAccount(user)) {
    return { hidden: true, reason: 'play_prelaunch', userRole: user.role };
  }
  return { hidden: false, reason: null, userRole: user.role };
}
