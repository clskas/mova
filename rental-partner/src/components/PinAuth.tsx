"use client";

import { useEffect, useState } from "react";

export type AuthPayload = {
  accessToken?: string;
  pinConfigured?: boolean;
  needsPinSetup?: boolean;
  phone?: string;
  email?: string;
  hasPhone?: boolean;
  user?: { phone?: string; email?: string; hasPhone?: boolean; role?: string };
};

const SEED_DEMO_PHONE_RE = /^\+2439000000\d{2}$/;
const RDC_PHONE_RE = /^\+243\d{9}$/;

export function isEmailIdentity(value: string): boolean {
  const n = value.trim();
  const at = n.indexOf("@");
  return at > 0 && at < n.length - 1;
}

/** Valid +243, else Google e-mail. Never store leftover "+243" or other garbage. */
export function accountPhone(data: AuthPayload, fallbackPhone?: string): string {
  const phone = String(data.user?.phone || data.phone || "").trim();
  if (RDC_PHONE_RE.test(phone)) return phone;
  const email = String(data.user?.email || data.email || "").trim();
  if (isEmailIdentity(email)) return email;
  const fallback = String(fallbackPhone || "").trim();
  if (RDC_PHONE_RE.test(fallback) || isEmailIdentity(fallback)) return fallback;
  return "";
}

export function jwtNeedsPinSetup(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("utf8");
    const payload = JSON.parse(json) as { needsPinSetup?: unknown; phone?: unknown };
    if (payload.needsPinSetup !== true) return false;
    const phone = typeof payload.phone === "string" ? payload.phone : "";
    return !SEED_DEMO_PHONE_RE.test(phone);
  } catch {
    return false;
  }
}

/** PIN obligatoire après OTP ou Google, même sans téléphone. Seed démo : pas de PIN. */
export function shouldRequirePinSetup(
  data: AuthPayload,
  fallbackPhone?: string,
  token?: string | null,
): boolean {
  if (data.pinConfigured === true) return false;
  const phone = accountPhone(data, fallbackPhone);
  if (SEED_DEMO_PHONE_RE.test(phone)) return false;
  void token;
  return true;
}

/** First login (phone OTP or Google): always create PIN except seed demo phones. */
export function mustSetupPinAfterPhoneLogin(
  data: AuthPayload,
  typedPhone: string,
  _fromPhoneOtp = false,
): boolean {
  void _fromPhoneOtp;
  if (data.pinConfigured === true) return false;
  const phone = accountPhone(data, typedPhone);
  if (SEED_DEMO_PHONE_RE.test(phone) || (typedPhone && SEED_DEMO_PHONE_RE.test(typedPhone))) return false;
  return true;
}

export const KYC_PIN_LOGIN_HINT_FR =
  "Après validation KYC, saisissez le PIN d'activation à 6 chiffres envoyé par e-mail (objet « Votre acces SENGA »).";

export const ACTIVATION_PIN_HEADING_FR =
  "PIN d'activation (6 chiffres, e-mail après validation KYC)";

export const PIN_FIELD_LABEL_FR = "PIN d'activation (6 chiffres, e-mail après validation KYC)";

export const PIN_SUBMIT_LABEL_FR = "Activer / Se connecter avec le PIN";

export const GOOGLE_OPTIONAL_LABEL_FR = "Ou continuer avec Google (compte déjà lié)";

export const COMPTE_ACTIVATE_HEADING_FR = "Activer le compte";

export const ACTIVATION_PIN_WINDOW_HEADING_FR = "Code PIN d'activation";

export const ACTIVATION_PIN_WINDOW_HINT_FR =
  "Votre dossier est validé. Saisissez le code à 6 chiffres reçu par e-mail ou SMS pour commencer à travailler. Ce n'est pas un code Google.";

export const LOGIN_IDENTITY_LABEL_FR = "Téléphone (+243) ou e-mail";

const PIN_EXEMPT_PATHS = ["/dossier", "/aide", "/manuel", "/compte"];

/** Dossier / aide stay usable; dashboard and reservations stay blocked. */
export function isPartnerPinExemptPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PIN_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function partnerNeedsKycActivationPin(opts: {
  kycStatus?: string | null;
  unlocked: boolean;
  identity?: string;
}): boolean {
  if (opts.unlocked) return false;
  const id = (opts.identity ?? "").trim();
  if (SEED_DEMO_PHONE_RE.test(id)) return false;
  return opts.kycStatus === "APPROVED";
}

export function PartnerLoginHelp({
  manuelHref = "/manuel",
  aideHref = "/aide",
  linkClass = "text-indigo-700 underline",
}: {
  manuelHref?: string;
  aideHref?: string;
  linkClass?: string;
}) {
  return (
    <p className="text-xs text-gray-400 text-center">
      {KYC_PIN_LOGIN_HINT_FR}{" "}
      <a href={manuelHref} className={linkClass}>
        Manuel
      </a>
      {" · "}
      <a href={aideHref} className={linkClass}>
        Aide
      </a>
    </p>
  );
}

export function PinForgotLink({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" data-testid="pin-forgot" className="w-full text-sm text-gray-500 underline" disabled={disabled} onClick={onClick}>
      PIN oublié
    </button>
  );
}

export function maskPhoneDisplay(phone: string): string {
  const n = phone.replace(/\s/g, "");
  if (n.includes("@")) {
    const at = n.indexOf("@");
    const local = n.slice(0, at);
    const domain = n.slice(at + 1);
    const keep = local.length <= 2 ? 1 : 2;
    return `${local.slice(0, keep)}***@${domain}`;
  }
  if (n.length < 7) return "votre numéro";
  return `${n.slice(0, 4)} ••• ${n.slice(-3)}`;
}

export function PinDigitPad({
  value,
  onChange,
  disabled,
  accentClass = "bg-indigo-600",
  compact = true,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  accentClass?: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;
  function press(key: string) {
    if (disabled || !key) return;
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length < 6) onChange(`${value}${key}`);
  }
  return (
    <div data-testid="pin-pad" className="space-y-3">
      <label className="block text-sm">
        <span className="font-semibold text-gray-800">{PIN_FIELD_LABEL_FR}</span>
        <input
          data-testid="login-pin"
          className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-white p-4 tracking-[0.45em] text-center text-2xl font-semibold"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="6 chiffres"
          disabled={disabled}
          autoFocus={autoFocus}
        />
      </label>
      <div className="flex justify-center gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${i < value.length ? accentClass : "bg-gray-200"}`}
          />
        ))}
      </div>
      {!compact && (
        <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
          {keys.map((key, i) => (
            <button
              key={`${key}-${i}`}
              type="button"
              disabled={disabled || key === ""}
              onClick={() => press(key)}
              className="h-14 rounded-xl bg-white border border-gray-100 shadow-sm text-xl font-semibold text-[#1A1A2E] disabled:opacity-0"
            >
              {key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivationPinCard({
  apiBase,
  intent,
  accentClass,
  highlightClass,
  defaultIdentity,
  onActivated,
  heading = COMPTE_ACTIVATE_HEADING_FR,
  hint,
  lockIdentity = false,
  normalizeIdentity,
}: {
  apiBase: string;
  intent: Record<string, string>;
  accentClass: string;
  highlightClass: string;
  defaultIdentity?: string;
  onActivated: (data: AuthPayload) => void;
  heading?: string;
  hint?: string;
  lockIdentity?: boolean;
  normalizeIdentity?: (raw: string) => string;
}) {
  const [identity, setIdentity] = useState(defaultIdentity ?? "");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultIdentity) setIdentity(defaultIdentity);
  }, [defaultIdentity]);

  async function submit() {
    if (!identity.trim()) {
      setError("Saisissez votre e-mail ou numéro +243.");
      return;
    }
    if (pin.length !== 6) {
      setError("Saisissez le PIN à 6 chiffres reçu par e-mail ou SMS.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const handle = normalizeIdentity ? normalizeIdentity(identity) : identity.trim();
      const result = await loginWithPinRequest(apiBase, handle, pin, intent);
      if (!result.ok) {
        throw new Error(result.data.error?.message ?? "PIN incorrect. Réessayez.");
      }
      onActivated(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PIN incorrect. Réessayez.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section data-testid="activation-pin-card" className={`rounded-2xl border-2 p-5 space-y-4 ${highlightClass}`}>
      <div>
        <h2 className="text-lg font-bold text-[#1A1A2E]">{heading}</h2>
        {hint ? (
          <p className="text-sm text-gray-700 mt-1">{hint}</p>
        ) : heading !== ACTIVATION_PIN_HEADING_FR ? (
          <p className="text-sm text-gray-700 mt-1">{ACTIVATION_PIN_HEADING_FR}</p>
        ) : null}
      </div>
      {lockIdentity && identity.trim() ? (
        <p className="text-sm text-gray-600">
          Compte : <span className="font-medium text-gray-800">{maskPhoneDisplay(identity)}</span>
        </p>
      ) : (
        <label className="block text-sm">
          <span className="font-semibold text-gray-800">{LOGIN_IDENTITY_LABEL_FR}</span>
          <input
            data-testid="login-phone"
            className="mt-1 w-full rounded-xl border-2 border-gray-300 bg-white p-3"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="+243 8XX XXX XXX ou e-mail"
            type="text"
            inputMode="text"
            autoComplete="username"
            disabled={loading}
          />
        </label>
      )}
      <PinDigitPad
        value={pin}
        onChange={setPin}
        disabled={loading}
        accentClass={accentClass}
        compact
        autoFocus={Boolean(identity.trim())}
      />
      <button
        type="button"
        disabled={loading || !identity.trim() || pin.length !== 6}
        onClick={() => void submit()}
        data-testid="activation-submit"
        className={`w-full py-3 rounded-xl text-white font-medium disabled:opacity-60 ${accentClass}`}
      >
        {loading ? "Activation…" : PIN_SUBMIT_LABEL_FR}
      </button>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </section>
  );
}

export async function fetchPinEnabled(
  apiBase: string,
  phone: string,
  extra: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/api/auth/login/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, ...extra }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { pinEnabled?: boolean };
    return data.pinEnabled === true;
  } catch {
    return false;
  }
}

export async function loginWithPinRequest(
  apiBase: string,
  phone: string,
  pin: string,
  extra: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: AuthPayload & { error?: { message?: string } } }> {
  const res = await fetch(`${apiBase}/api/auth/pin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin, ...extra }),
  });
  const data = (await res.json().catch(() => ({}))) as AuthPayload & { error?: { message?: string } };
  return { ok: res.ok && Boolean(data.accessToken), status: res.status, data };
}

type PinSetupProps = {
  apiBase: string;
  token: string;
  onDone: () => void;
  accentClass: string;
  reset?: boolean;
};

export function PinSetupForm({ apiBase, token, onDone, accentClass, reset }: PinSetupProps) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (pin.length !== 6 || confirm.length !== 6) {
      setError("Le code PIN doit contenir 6 chiffres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/auth/pin/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin, confirmPin: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Impossible d'enregistrer le PIN. Réessayez.");
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer le PIN. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-center text-[#1A1A2E]">
        {reset ? "Définir un nouveau code PIN" : "Créer votre code PIN"}
      </h2>
      <p className="text-sm text-gray-600 text-center">
        Obligatoire pour les prochaines connexions. 6 chiffres — évitez 123456 ou des chiffres identiques. Pas d&apos;étape suivante sans enregistrement.
      </p>
      <label className="block text-sm">
        <span className="text-gray-600">Nouveau PIN</span>
        <input
          className="mt-1 w-full rounded-xl border border-gray-200 p-3 tracking-widest"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Confirmer le PIN</span>
        <input
          className="mt-1 w-full rounded-xl border border-gray-200 p-3 tracking-widest"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
        />
      </label>
      <button
        type="button"
        disabled={loading || pin.length !== 6 || confirm.length !== 6}
        onClick={() => void submit()}
        className={`w-full py-3 rounded-xl text-white font-medium disabled:opacity-60 ${accentClass}`}
      >
        {loading ? "Enregistrement…" : "Enregistrer le PIN"}
      </button>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </div>
  );
}
