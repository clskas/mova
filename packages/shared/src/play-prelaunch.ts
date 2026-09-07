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

/**
 * Safe to hide / list / purge only when there is no phone.
 * A real user who somehow reused a numbered Gmail but added +243 is kept.
 */
export function isPlayPrelaunchAccount(user: {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  if ((user.phone ?? '').trim()) return false;
  if (isCloudTestLabEmail(user.email)) return true;
  if (isPlayVirtualGmail(user.email)) return true;
  return isPlayPrelaunchDisplayName(user.firstName, user.lastName);
}
