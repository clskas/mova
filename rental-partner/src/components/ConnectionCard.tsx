"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleContinueButton, googleClientId } from "@/components/GoogleContinueButton";
import { apiFetch } from "@/lib/api";
import { normalizeLoginPhone, setToken } from "@/lib/auth";
import { toUserErrorMessage } from "@/lib/user-messages";

type Me = {
  phone?: string;
  phoneMasked?: string;
  email?: string;
  emailMasked?: string;
  googleLinked?: boolean;
  hasPhone?: boolean;
  canUnlinkGoogle?: boolean;
  canUnlinkPhone?: boolean;
};

type LinkRes = {
  accessToken?: string;
  message?: string;
};

const OPTIONAL_COPY =
  "Optionnel. Vous pouvez utiliser seulement le téléphone, seulement Google, ou les deux pour le même compte.";

export function ConnectionCard() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const load = useCallback(async () => {
    try {
      setMe(await apiFetch<Me>("/api/users/me"));
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger le compte"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyLink(data: LinkRes, fallback: string) {
    if (data.accessToken) setToken(data.accessToken);
    setSnack(data.message ?? fallback);
    setError(null);
    setOtpSent(false);
    setOtp("");
    void load();
  }

  async function linkGoogle(idToken: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<LinkRes>("/api/auth/link-google", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
      applyLink(data, "Compte lié. Vous pouvez vous connecter avec le téléphone ou Google.");
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de lier Google"));
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone: normalizeLoginPhone(phone) }),
      });
      setOtpSent(true);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible d'envoyer le code"));
    } finally {
      setBusy(false);
    }
  }

  async function linkPhone() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<LinkRes>("/api/auth/link-phone", {
        method: "POST",
        body: JSON.stringify({ phone: normalizeLoginPhone(phone), otpCode: otp.trim() }),
      });
      applyLink(data, "Compte lié. Vous pouvez vous connecter avec le téléphone ou Google.");
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de lier le numéro"));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(kind: "google" | "phone") {
    const ok = window.confirm(
      kind === "google"
        ? "Détacher Google ? Vous pourrez encore vous connecter avec votre numéro."
        : "Détacher le numéro ? Vous pourrez encore vous connecter avec Google.",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<LinkRes>(`/api/auth/unlink-${kind}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      applyLink(data, "Compte mis à jour.");
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de détacher"));
    } finally {
      setBusy(false);
    }
  }

  const googleLinked = me?.googleLinked === true;
  const hasPhone = me?.hasPhone === true || Boolean(me?.phone);
  const phoneLabel = me?.phoneMasked || me?.phone || "non lié";
  const emailLabel = me?.emailMasked || me?.email || "non lié";

  return (
    <section className="bg-white rounded-2xl border p-6 space-y-3">
      <div>
        <h3 className="font-semibold text-sm text-gray-700">Connexion</h3>
        <p className="text-xs text-gray-500 mt-1">{OPTIONAL_COPY}</p>
      </div>
      {snack && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg py-2 px-3">{snack}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <>
          <p className="text-sm">
            <span className="text-gray-500">Téléphone :</span>{" "}
            <strong>{hasPhone ? `lié · ${phoneLabel}` : "non lié"}</strong>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Google :</span>{" "}
            <strong>{googleLinked ? `lié · ${emailLabel}` : "non lié"}</strong>
          </p>
          {!googleLinked && googleClientId() && (
            <div className="pt-1">
              <p className="text-sm font-medium mb-2">Lier Google</p>
              <GoogleContinueButton onCredential={linkGoogle} disabled={busy} />
            </div>
          )}
          {!hasPhone && (
            <div className="pt-1 space-y-2">
              <p className="text-sm font-medium">Lier un numéro</p>
              <input
                className="w-full rounded-xl border p-3"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+243 8XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy || otpSent}
              />
              {otpSent && (
                <input
                  className="w-full rounded-xl border p-3"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Code à 6 chiffres"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                />
              )}
              <button
                type="button"
                onClick={otpSent ? linkPhone : requestOtp}
                disabled={busy || !phone.trim() || (otpSent && !otp.trim())}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
              >
                {busy ? "Chargement…" : otpSent ? "Confirmer le numéro" : "Lier un numéro"}
              </button>
            </div>
          )}
          {me?.canUnlinkGoogle && (
            <button type="button" disabled={busy} onClick={() => unlink("google")} className="text-sm text-gray-500 underline">
              Détacher Google
            </button>
          )}
          {me?.canUnlinkPhone && (
            <button type="button" disabled={busy} onClick={() => unlink("phone")} className="text-sm text-gray-500 underline block">
              Détacher le numéro
            </button>
          )}
        </>
      )}
    </section>
  );
}
