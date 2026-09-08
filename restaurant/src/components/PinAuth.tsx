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
  "Première connexion : code SMS ou e-mail, puis PIN de connexion (6 chiffres) pour les prochaines fois. Ensuite : Google, ou téléphone / e-mail + PIN.";

export const ACTIVATION_PIN_HEADING_FR = "Code PIN d'activation";

export const PIN_FIELD_LABEL_FR = "Code à 6 chiffres";

export const PIN_SUBMIT_LABEL_FR = "Valider";

export const GOOGLE_OPTIONAL_LABEL_FR = "Continuer avec Google";

export const LOGIN_CLASSIC_LABEL_FR = "Ou avec téléphone / e-mail";

export const COMPTE_ACTIVATE_HEADING_FR = "Code PIN de connexion";

export const CONNECTION_PIN_HEADING_FR = "PIN de connexion pour les prochaines connexions";

export const ACTIVATION_PIN_WINDOW_HEADING_FR = "Code PIN de connexion";

export const ACTIVATION_PIN_WINDOW_HINT_FR =
  "Ce PIN servira pour les prochaines connexions. Saisissez le code à 6 chiffres envoyé par e-mail ou SMS après validation de votre dossier (objet « Votre acces SENGA restaurant »). Ce n'est pas un code Google.";

export const WORK_ACTIVATION_PIN_HEADING_FR = "Code PIN d'activation";

export const WORK_ACTIVATION_PIN_HINT_FR =
  "Dossier validé — saisissez le PIN reçu par e-mail pour commencer à travailler.";

export const PIN_SETUP_HINT_FR =
  "Choisissez / confirmez votre PIN de connexion (6 chiffres) pour les prochaines fois.";

export const LOGIN_IDENTITY_LABEL_FR = "Téléphone (+243) ou e-mail";

export const CONNECTION_LOGIN_TITLE_FR = "Connexion";

export const CONNECTION_PIN_FOOTER_FR =
  "Téléphone : code par SMS. Google : connexion directe (identité déjà vérifiée par Google). Après la première connexion avec un téléphone, le PIN à 6 chiffres est obligatoire. PIN oublié : SMS ou Google, puis un nouveau code.";

export function connectionPinPrompt(identity: string): string {
  return `Entrez le PIN pour ${maskPhoneDisplay(identity)}`;
}

const PIN_HELP_PATHS = ["/aide", "/manuel"];

/** Aide / manuel stay readable. After a PIN is issued, work pages stay blocked. */
export function isPartnerPinExemptPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PIN_HELP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type PartnerConnectionPinMode = "setup" | "enter" | null;

export function partnerKycIsApproved(status?: string | null, canOperate?: boolean): boolean {
  if (canOperate === true) return true;
  return String(status ?? "").trim().toUpperCase() === "APPROVED";
}

/** Keep in sync with packages/shared/src/partner-connection-pin.ts */
export function partnerConnectionPinMode(opts: {
  pinConfigured?: boolean;
  kycStatus?: string | null;
  canOperate?: boolean;
  unlocked: boolean;
  identity?: string;
}): PartnerConnectionPinMode {
  if (opts.unlocked) return null;
  const id = (opts.identity ?? "").trim();
  if (SEED_DEMO_PHONE_RE.test(id)) return null;
  if (opts.pinConfigured === true) return "enter";
  if (opts.pinConfigured === false) return null;
  if (partnerKycIsApproved(opts.kycStatus, opts.canOperate)) return "enter";
  return null;
}

export function partnerNeedsKycActivationPin(opts: {
  kycStatus?: string | null;
  canOperate?: boolean;
  unlocked: boolean;
  identity?: string;
  pinConfigured?: boolean;
}): boolean {
  return partnerConnectionPinMode(opts) === "enter";
}

export function partnerNeedsWorkActivationPin(opts: {
  kycStatus?: string | null;
  activationPinVerified?: boolean;
  identity?: string;
}): boolean {
  const id = (opts.identity ?? "").trim();
  if (SEED_DEMO_PHONE_RE.test(id)) return false;
  if (opts.activationPinVerified === true) return false;
  return partnerKycIsApproved(opts.kycStatus);
}

export function PartnerLoginHelp({
  manuelHref = "/manuel",
  aideHref = "/aide",
  linkClass = "text-orange-700 underline",
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
  accentClass = "bg-[#FF6B35]",
  compact = true,
  autoFocus = false,
  fieldLabel,
  keypadOnly = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  accentClass?: string;
  compact?: boolean;
  autoFocus?: boolean;
  fieldLabel?: string;
  keypadOnly?: boolean;
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
  const showKeypad = keypadOnly || !compact;
  return (
    <div data-testid="pin-pad" className="space-y-4">
      {!keypadOnly && (
        <label className="block text-sm">
          {fieldLabel ? <span className="font-semibold text-gray-800">{fieldLabel}</span> : null}
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
      )}
      {keypadOnly && (
        <input
          data-testid="login-pin"
          className="sr-only"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      )}
      <div className="flex justify-center gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${i < value.length ? accentClass : "bg-gray-200"}`}
          />
        ))}
      </div>
      {showKeypad && (
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
  heading = ACTIVATION_PIN_WINDOW_HEADING_FR,
  hint = ACTIVATION_PIN_WINDOW_HINT_FR,
  lockIdentity = false,
  normalizeIdentity,
  submitLabel = PIN_SUBMIT_LABEL_FR,
  verifyPath,
  authToken,
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
  submitLabel?: string;
  verifyPath?: string;
  authToken?: string | null;
}) {
  const [identity, setIdentity] = useState(defaultIdentity ?? "");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultIdentity) setIdentity(defaultIdentity);
  }, [defaultIdentity]);

  async function submit() {
    if (!identity.trim() && !intent.userId) {
      setError(lockIdentity ? "Compte non identifié. Reconnectez-vous." : "Saisissez votre e-mail ou numéro +243.");
      return;
    }
    if (pin.length !== 6) {
      setError("Saisissez le PIN à 6 chiffres reçu par e-mail ou SMS.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (verifyPath) {
        const res = await fetch(`${apiBase}${verifyPath}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ pin }),
        });
        const data = (await res.json().catch(() => ({}))) as AuthPayload & { error?: { message?: string } };
        if (!res.ok) {
          throw new Error(data.error?.message ?? "PIN incorrect. Réessayez.");
        }
        onActivated(data);
        return;
      }
      const handle = identity.trim()
        ? normalizeIdentity
          ? normalizeIdentity(identity)
          : identity.trim()
        : "";
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
        {hint ? <p className="text-sm text-gray-700 mt-1">{hint}</p> : null}
      </div>
      {lockIdentity ? (
        identity.trim() ? (
          <p className="text-sm text-gray-600">
            Compte : <span className="font-medium text-gray-800">{maskPhoneDisplay(identity)}</span>
          </p>
        ) : null
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
        autoFocus={lockIdentity || Boolean(identity.trim())}
        fieldLabel={PIN_FIELD_LABEL_FR}
      />
      <button
        type="button"
        disabled={loading || (!identity.trim() && !intent.userId) || pin.length !== 6}
        onClick={() => void submit()}
        data-testid="activation-submit"
        className={`w-full py-3 rounded-xl text-white font-medium disabled:opacity-60 ${accentClass}`}
      >
        {loading ? "Validation…" : submitLabel}
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
    <div className="space-y-4" data-testid="connection-pin-setup">
      <h2 className="text-lg font-semibold text-center text-[#1A1A2E]">
        {reset ? "Définir un nouveau code PIN" : CONNECTION_PIN_HEADING_FR}
      </h2>
      <p className="text-sm text-gray-600 text-center">
        {reset
          ? "Obligatoire pour les prochaines connexions. 6 chiffres — évitez 123456 ou des chiffres identiques."
          : PIN_SETUP_HINT_FR}
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
