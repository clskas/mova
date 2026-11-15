import { apiFetch } from "@/lib/api";

const KEY = "senga_referral_code";

export const PLAY_PASSENGER = "cd.mova.mova.passenger";
export const PLAY_DRIVER = "cd.mova.mova.driver";
export const IOS_PASSENGER = "https://apps.apple.com/app/id6818768971";
export const IOS_DRIVER = "https://apps.apple.com/app/id6818769267";

/** « sg ab-12 cd » → « SGAB12CD »; null when it cannot be a code. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const c = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 4 && c.length <= 16 ? c : null;
}

/** Play Store link that hands the code to the app after install (install referrer). */
export function playStoreLink(code: string, driver = false): string {
  const id = driver ? PLAY_DRIVER : PLAY_PASSENGER;
  return `https://play.google.com/store/apps/details?id=${id}&referrer=${encodeURIComponent(`ref=${code}&utm_source=invite`)}`;
}

/** Invitation link opened (?ref=CODE[&app=driver]): keep the code for the sign-up. */
export function captureReferralFromUrl(): { code: string; driver: boolean } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = normalizeReferralCode(params.get("ref"));
  if (!code) return null;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* private mode */
  }
  return { code, driver: params.get("app") === "driver" };
}

export function getPendingReferral(): string | null {
  try {
    return normalizeReferralCode(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function setPendingReferral(raw: string | null) {
  try {
    const c = normalizeReferralCode(raw);
    if (c) localStorage.setItem(KEY, c);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** After the sign-in: sends the pending code once. Old accounts are skipped by the server. */
export async function applyPendingReferral(): Promise<"ok" | string | null> {
  const code = getPendingReferral();
  if (!code) return null;
  setPendingReferral(null);
  try {
    await apiFetch("/api/users/me/referral", { method: "POST", body: JSON.stringify({ code }) });
    return "ok";
  } catch (e) {
    return e instanceof Error ? e.message : null;
  }
}
