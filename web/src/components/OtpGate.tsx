"use client";

import { useEffect, useState } from "react";
import { GoogleContinueButton, googleClientId } from "@/components/GoogleContinueButton";
import { ApiError, apiFetch, checkGatewayHealth } from "@/lib/api";
import { clearToken, getToken, isSeedDemoPhone, normalizeLoginPhone, setToken } from "@/lib/auth";
import { toUserErrorMessage } from "@/lib/user-messages";

type Props = { children: React.ReactNode };

export function OtpGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [mock, setMock] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [googleChallenge, setGoogleChallenge] = useState<{
    id: string;
    channel: string;
    masked: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const allowMock = process.env.NODE_ENV !== "production";
    checkGatewayHealth().then((ok) => {
      setMock(allowMock && !ok);
      setAuthenticated(Boolean(getToken()));
      setReady(true);
    });
  }, []);

  async function requestOtp() {
    setLoading(true);
    setError(null);
    try {
      const msisdn = normalizeLoginPhone(phone);
      await apiFetch("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone: msisdn }),
      }, { useMock: mock });
      setCode(isSeedDemoPhone(msisdn) ? "123456" : "");
      setCodeSent(true);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(toUserErrorMessage(
        e,
        status === 503
          ? "Impossible d'envoyer le code par SMS. Réessayez dans quelques minutes."
          : "Impossible d'envoyer le code",
      ));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        accessToken?: string;
        otpRequired?: boolean;
        challengeId?: string;
        otpChannel?: string;
        destinationMasked?: string;
        mockCode?: string;
        user?: { phone?: string };
      }>("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      }, { useMock: mock });
      if (data.otpRequired && data.challengeId) {
        setGoogleChallenge({
          id: data.challengeId,
          channel: data.otpChannel ?? "email",
          masked: data.destinationMasked ?? "",
        });
        setCode(data.mockCode ?? "");
        setCodeSent(true);
        return;
      }
      if (data.accessToken) {
        setToken(data.accessToken, data.user?.phone);
        setAuthenticated(true);
      } else {
        setError("Connexion Google impossible. Veuillez réessayer.");
      }
    } catch (e) {
      setError(toUserErrorMessage(e, "Connexion Google refusée"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const data = googleChallenge
        ? await apiFetch<{ accessToken?: string; user?: { phone?: string } }>("/api/auth/google/verify", {
            method: "POST",
            body: JSON.stringify({ challengeId: googleChallenge.id, code: code.trim() }),
          }, { useMock: mock })
        : await apiFetch<{ accessToken?: string; user?: { phone?: string } }>("/api/auth/otp/verify", {
            method: "POST",
            body: JSON.stringify({ phone: normalizeLoginPhone(phone), code: code.trim() }),
          }, { useMock: mock });
      if (data.accessToken) {
        setToken(data.accessToken, data.user?.phone ?? phone);
        setAuthenticated(true);
      } else {
        setError("Connexion impossible. Veuillez réessayer.");
      }
    } catch (e) {
      setError(toUserErrorMessage(e, "Code OTP invalide"));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-sm mx-auto min-h-[100dvh] flex flex-col justify-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <h1 className="text-xl font-bold text-center mb-2">SENGA — Connexion</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {googleChallenge
            ? googleChallenge.channel === "email"
              ? `Un code a été envoyé par e-mail${googleChallenge.masked ? ` (${googleChallenge.masked})` : ""}. Vérifiez votre boîte de réception.`
              : `Un code SMS a été envoyé${googleChallenge.masked ? ` (${googleChallenge.masked})` : ""}.`
            : isSeedDemoPhone(phone)
              ? "Numéro de démo : code 123456, pas de SMS."
              : "Entrez votre numéro +243. Un SMS avec le code vous sera envoyé."}
        </p>
        {mock && (
          <p className="text-sm text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3 mb-4 text-center">
            Mode démo — passerelle indisponible. Utilisez le code de test fourni.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>
        )}
        <input
          className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+243 8XX XXX XXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={codeSent || Boolean(googleChallenge)}
        />
        {codeSent && (
          <input
            className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            placeholder={
              googleChallenge?.channel === "email"
                ? "Code reçu par e-mail"
                : isSeedDemoPhone(phone)
                  ? "123456 (démo)"
                  : "Code à 6 chiffres"
            }
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
        )}
        <button
          type="button"
          onClick={codeSent ? verifyOtp : requestOtp}
          disabled={loading || (!googleChallenge && !phone.trim()) || (codeSent && !code.trim())}
          className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
        >
          {loading ? "Chargement…" : codeSent ? "Se connecter" : "Recevoir le code"}
        </button>
        {googleClientId() && !codeSent && !googleChallenge && (
          <>
            <p className="text-center text-xs text-gray-400 my-4">ou</p>
            <GoogleContinueButton onCredential={loginWithGoogle} disabled={loading} />
          </>
        )}
        {codeSent && (
          <button
            type="button"
            className="w-full mt-3 text-sm text-gray-500 underline"
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setGoogleChallenge(null);
              setError(null);
            }}
          >
            {googleChallenge ? "Retour" : "Changer de numéro"}
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

export function useLogout() {
  return () => {
    clearToken();
    window.location.reload();
  };
}
