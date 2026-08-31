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
};

export function PinSetupForm({ apiFetchFn, onDone }: PinSetupProps) {
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
      <h1 className="text-xl font-bold text-center mb-2">Créer votre code PIN</h1>
      <p className="text-sm text-gray-500 text-center mb-6">
        6 chiffres pour vos prochaines connexions. Évitez 123456 ou des chiffres identiques. OTP et Google restent disponibles.
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
