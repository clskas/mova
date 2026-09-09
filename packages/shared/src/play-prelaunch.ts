/**
 * Google Play pre-launch report / Firebase Test Lab accounts.
 *
 * Play Store crawls the production apps with Google Sign-In. Those sessions
 * create real users (no +243) — not the demo seed `+2439000000xx`.
 *
 * Signals (all must stay conservative — never match a real RDC rider):
 * - official Test Lab mailbox `*@cloudtestlabaccounts.com`
 * - Play virtual users `firstname.lastname.NNNNN@gmail.com` with no phone
 * - display name "Cloud Test Lab" / "Nuage Laboratoire"
 */

const CLOUD_TEST_LAB_DOMAIN = /@cloudtestlabaccounts\.com$/i;
/**
 * Play virtual Gmail: `martinpearson.39569@gmail.com` or `first.last.39569@gmail.com`.
 * The five-digit suffix is the Test Lab fingerprint — never a typical RDC mailbox.
 */
const PLAY_VIRTUAL_GMAIL = /^[a-z0-9]+(?:[._][a-z0-9]+)*\.\d{5}@gmail\.com$/i;
const TEST_LAB_DISPLAY_NAME =
  /^(nuage\s+laboratoire|cloud\s+test\s+lab|firebase\s+test\s+lab)$/i;

export function isCloudTestLabEmail(email?: string | null): boolean {
  return CLOUD_TEST_LAB_DOMAIN.test((email ?? '').trim());
}

export function isPlayVirtualGmail(email?: string | null): boolean {
  return PLAY_VIRTUAL_GMAIL.test((email ?? '').trim().toLowerCase());
}

export function isPlayPrelaunchDisplayName(firstName?: string | null, lastName?: string | null): boolean {
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  if (TEST_LAB_DISPLAY_NAME.test(combined)) return true;
  return TEST_LAB_DISPLAY_NAME.test((firstName ?? '').trim()) || TEST_LAB_DISPLAY_NAME.test((lastName ?? '').trim());
}

export type PlayPrelaunchUser = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
};

/**
 * Official Firebase / Play crawler mailbox or display name — never a real RDC partner.
 * Does not include numbered Gmail (`prenom.nom.12345`) which can collide with a
 * restaurant / loueur who signed in with Google and has no +243 yet.
 */
export function isOfficialPlayTestLabAccount(user: PlayPrelaunchUser): boolean {
  if ((user.phone ?? '').trim()) return false;
  if (isCloudTestLabEmail(user.email)) return true;
  return isPlayPrelaunchDisplayName(user.firstName, user.lastName);
}

/**
 * Safe to hide / list / purge only when there is no phone.
 * A real user who somehow reused a numbered Gmail but added +243 is kept.
 */
export function isPlayPrelaunchAccount(user: PlayPrelaunchUser): boolean {
  if ((user.phone ?? '').trim()) return false;
  if (isOfficialPlayTestLabAccount(user)) return true;
  if (isPlayVirtualGmail(user.email)) return true;
  return false;
}

/**
 * Utilisateurs / KYC / Chauffeurs default lists: hide Play crawlers, but keep
 * restaurant, rental, and DRIVER accounts who signed in with Google (email, no +243).
 * Numbered Gmail without a real DRIVER/partner role still matches isPlayPrelaunchAccount.
 */
export function isAdminHiddenPlayAccount(user: PlayPrelaunchUser): boolean {
  if (user.role === 'RESTAURANT' || user.role === 'RENTAL_PARTNER' || user.role === 'DRIVER') {
    return isOfficialPlayTestLabAccount(user);
  }
  return isPlayPrelaunchAccount(user);
}
