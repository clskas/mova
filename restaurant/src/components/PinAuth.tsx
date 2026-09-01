"use client";

import { useState } from "react";

export type AuthPayload = {
  accessToken?: string;
  pinConfigured?: boolean;
  needsPinSetup?: boolean;
  phone?: string;
  hasPhone?: boolean;
  user?: { phone?: string; hasPhone?: boolean; role?: string };
};

const SEED_DEMO_PHONE_RE = /^\+2439000000\d{2}$/;

/** Empty string is missing — `??` would ignore the OTP typed phone. */
export function accountPhone(data: AuthPayload, fallbackPhone?: string): string {
  return String(data.user?.phone || data.phone || fallbackPhone || "").trim();
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

/** PIN obligatoire dès qu'un téléphone est connu (OTP saisi, JWT, /me). Google seul : pas de PIN. */
export function shouldRequirePinSetup(
  data: AuthPayload,
  fallbackPhone?: string,
  token?: string | null,
): boolean {
  if (data.pinConfigured === true) return false;
  const phone = accountPhone(data, fallbackPhone);
  if (SEED_DEMO_PHONE_RE.test(phone)) return false;
  if (data.needsPinSetup === true || jwtNeedsPinSetup(token)) return true;
  return Boolean(data.user?.hasPhone || data.hasPhone || phone);
}

/** Phone OTP: always create PIN. `fromPhoneOtp` ignores empty API phone (prod bug). */
export function mustSetupPinAfterPhoneLogin(
  data: AuthPayload,
  typedPhone: string,
  fromPhoneOtp = false,
): boolean {
  if (data.pinConfigured === true) return false;
  const phone = accountPhone(data, typedPhone);
  if (SEED_DEMO_PHONE_RE.test(phone) || (typedPhone && SEED_DEMO_PHONE_RE.test(typedPhone))) return false;
  if (fromPhoneOtp) return true;
  return Boolean(typedPhone);
}

export function PinForgotLink({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="w-full text-sm text-gray-500 underline" disabled={disabled} onClick={onClick}>
      PIN oublié
    </button>
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
