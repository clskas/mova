"use client";

import { useState } from "react";

export type AuthPayload = {
  accessToken?: string;
  pinConfigured?: boolean;
  user?: { phone?: string; hasPhone?: boolean; role?: string };
};

export function shouldRequirePinSetup(data: AuthPayload): boolean {
  if (data.pinConfigured) return false;
  return Boolean(data.user?.hasPhone || data.user?.phone);
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
};

export function PinSetupForm({ apiBase, token, onDone }: PinSetupProps) {
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
      <p className="text-sm text-gray-600 text-center">
        Choisissez un code PIN à 6 chiffres pour vos prochaines connexions. Évitez 123456 ou des chiffres identiques.
      </p>
      <label className="block text-sm">
        <span className="font-medium text-gray-700">Nouveau PIN</span>
        <input
          className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20 tracking-widest"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-gray-700">Confirmer le PIN</span>
        <input
          className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20 tracking-widest"
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
        className="mova-btn-primary w-full"
      >
        {loading ? "Enregistrement…" : "Enregistrer le PIN"}
      </button>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </div>
  );
}
