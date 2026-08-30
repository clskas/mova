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
  user?: { phone?: string };
};

const LINKED_SNACK = "Compte lié. Vous pouvez vous connecter avec le téléphone ou Google.";

type Props = { onBack: () => void; mock?: boolean };

export function AccountView({ onBack, mock }: Props) {
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
      const data = await apiFetch<Me>("/api/users/me", undefined, { useMock: mock });
      setMe(data);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de charger le compte"));
    } finally {
      setLoading(false);
    }
  }, [mock]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyLink(data: LinkRes, fallback: string) {
    if (data.accessToken) setToken(data.accessToken, data.user?.phone);
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
      }, { useMock: mock });
      applyLink(data, LINKED_SNACK);
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
      const msisdn = normalizeLoginPhone(phone);
      await apiFetch("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone: msisdn }),
      }, { useMock: mock });
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
      }, { useMock: mock });
      applyLink(data, LINKED_SNACK);
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
      }, { useMock: mock });
      applyLink(data, "Compte mis à jour.");
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible de délier"));
    } finally {
      setBusy(false);
    }
  }

  const googleLinked = me?.googleLinked === true;
  const hasPhone = me?.hasPhone === true || Boolean(me?.phone);
  const phoneLabel = me?.phoneMasked || me?.phone || "Non lié";
  const emailLabel = me?.emailMasked || me?.email || "Non lié";
  const linkedBoth = googleLinked && hasPhone;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-[#6C63FF] text-sm font-medium">
        ← Retour
      </button>

      <div>
        <h2 className="text-lg font-bold">Connexion</h2>
        <p className="text-sm text-gray-500">
          Optionnel. Vous pouvez utiliser seulement le téléphone, seulement Google, ou les deux pour le même compte.
        </p>
      </div>

      {snack && (
        <p className="text-sm text-[#00A37A] bg-emerald-50 rounded-lg py-2 px-3">{snack}</p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <section className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <p className="text-sm">
            <span className="text-gray-500">Téléphone :</span>{" "}
            <strong>{hasPhone ? `lié · ${phoneLabel}` : "non lié"}</strong>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Google :</span>{" "}
            <strong>{googleLinked ? `lié · ${emailLabel}` : "non lié"}</strong>
          </p>
          {linkedBoth && (
            <p className="text-xs text-gray-500">Les deux méthodes sont liées. Un seul portefeuille.</p>
          )}

          {!googleLinked && googleClientId() && (
            <div className="pt-2">
              <p className="text-sm font-medium mb-2">Lier Google</p>
              <GoogleContinueButton onCredential={linkGoogle} disabled={busy} />
            </div>
          )}

          {!hasPhone && (
            <div className="pt-2 space-y-2">
              <p className="text-sm font-medium">Lier un numéro</p>
              <input
                className="w-full rounded-xl border border-gray-200 bg-white p-3"
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
                  className="w-full rounded-xl border border-gray-200 bg-white p-3"
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
                className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
              >
                {busy ? "Chargement…" : otpSent ? "Confirmer le numéro" : "Lier un numéro"}
              </button>
              {otpSent && (
                <button
                  type="button"
                  className="w-full text-sm text-gray-500 underline"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                  }}
                >
                  Changer de numéro
                </button>
              )}
            </div>
          )}

          {me?.canUnlinkGoogle && (
            <button
              type="button"
              disabled={busy}
              onClick={() => unlink("google")}
              className="text-sm text-gray-500 underline"
            >
              Délier Google
            </button>
          )}
          {me?.canUnlinkPhone && (
            <button
              type="button"
              disabled={busy}
              onClick={() => unlink("phone")}
              className="text-sm text-gray-500 underline block"
            >
              Délier le numéro
            </button>
          )}
        </section>
      )}
    </div>
  );
}
