"use client";

import { useState } from "react";

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

/** Empty string is missing — `??` would ignore the OTP typed phone. Email is the Google-only identity. */
export function accountPhone(data: AuthPayload, fallbackPhone?: string): string {
  return String(data.user?.phone || data.phone || data.user?.email || data.email || fallbackPhone || "").trim();
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
  if (data.pinConfigured === true) return false;
  const phone = accountPhone(data, typedPhone);
  if (SEED_DEMO_PHONE_RE.test(phone) || (typedPhone && SEED_DEMO_PHONE_RE.test(typedPhone))) return false;
  return true;
}

export function PinForgotLink({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid="pin-forgot"
      className="w-full mt-3 text-sm text-gray-500 underline disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
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
  accentClass = "bg-[#6C63FF]",
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  accentClass?: string;
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
    <div data-testid="pin-pad" className="space-y-4">
      <div className="flex justify-center gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${i < value.length ? accentClass : "bg-gray-200"}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
        {keys.map((key, i) => (
          <button
            key={`${key}-${i}`}
            type="button"
            disabled={disabled || key === ""}
            onClick={() => press(key)}
            className="h-14 rounded-xl bg-white shadow-sm text-xl font-semibold text-[#1A1A2E] disabled:opacity-0"
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}

export async function fetchPinEnabled(apiFetchFn: typeof import("@/lib/api").apiFetch, phone: string): Promise<boolean> {
  try {
    const data = await apiFetchFn<{ pinEnabled?: boolean }>("/api/auth/login/options", {
      method: "POST",
      body: JSON.stringify({ phone, intendedRole: "PASSENGER" }),
    });
    return data.pinEnabled === true;
  } catch {
    return false;
  }
}

type PinSetupProps = {
  apiFetchFn: (path: string, init?: RequestInit, opts?: { useMock?: boolean }) => Promise<{ pinConfigured?: boolean }>;
  onDone: () => void;
  reset?: boolean;
};

export function PinSetupForm({ apiFetchFn, onDone, reset }: PinSetupProps) {
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
      await apiFetchFn("/api/auth/pin/setup", {
        method: "POST",
        body: JSON.stringify({ pin, confirmPin: confirm }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'enregistrer le PIN. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto min-h-[100dvh] flex flex-col justify-center p-6">
      <h1 className="text-xl font-bold text-center mb-2">
        {reset ? "Définir un nouveau code PIN" : "Créer votre code PIN"}
      </h1>
      <p className="text-sm text-gray-500 text-center mb-6">
        6 chiffres — obligatoire pour les prochaines connexions. Évitez 123456 ou des chiffres identiques. Pas d&apos;étape suivante sans enregistrement.
      </p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>}
      <input
        className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3 tracking-widest"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        placeholder="Nouveau PIN"
      />
      <input
        className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3 tracking-widest"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        placeholder="Confirmer le PIN"
      />
      <button
        type="button"
        disabled={loading || pin.length !== 6 || confirm.length !== 6}
        onClick={() => void submit()}
        className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Enregistrement…" : "Enregistrer le PIN"}
      </button>
    </div>
  );
}
