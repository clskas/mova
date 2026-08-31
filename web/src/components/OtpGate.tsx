"use client";

import { useEffect, useState } from "react";
import { GoogleContinueButton, googleClientId } from "@/components/GoogleContinueButton";
import { ApiError, apiFetch, checkGatewayHealth } from "@/lib/api";
import { clearToken, getToken, isPinPending, normalizeLoginPhone, setPinPending, setToken } from "@/lib/auth";
import { LOGIN_GOOGLE_UNAVAILABLE, LOGIN_OTP_UNAVAILABLE, toUserErrorMessage } from "@/lib/user-messages";
import { AuthPayload, PinSetupForm, fetchPinEnabled, shouldRequirePinSetup } from "@/components/PinAuth";

type Props = { children: React.ReactNode };

export function OtpGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [setupPin, setSetupPin] = useState(false);
  const [mock, setMock] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [googleChallenge, setGoogleChallenge] = useState<{
    id: string;
    channel: string;
    masked: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const allowMock = process.env.NODE_ENV !== "production";
    let cancelled = false;
    void (async () => {
      const ok = await checkGatewayHealth();
      if (cancelled) return;
      const useMock = allowMock && !ok;
      setMock(useMock);
      const token = getToken();
      if (!token) {
        setReady(true);
        return;
      }
      if (isPinPending()) {
        setSetupPin(true);
        setReady(true);
        return;
      }
      try {
        const me = await apiFetch<{ pinConfigured?: boolean; phone?: string; hasPhone?: boolean }>(
          "/api/users/me",
          undefined,
          { useMock },
        );
        if (cancelled) return;
        if (shouldRequirePinSetup({ pinConfigured: me.pinConfigured, user: me })) {
          setPinPending(true);
          setSetupPin(true);
          setReady(true);
          return;
        }
        setAuthenticated(true);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          clearToken();
        } else {
          setAuthenticated(true);
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function completeSession(data: AuthPayload & { user?: { phone?: string } }) {
    if (!data.accessToken) {
      setError(LOGIN_GOOGLE_UNAVAILABLE);
      return;
    }
    setToken(data.accessToken, data.user?.phone ?? phone);
    if (shouldRequirePinSetup(data)) {
      setPinPending(true);
      setSetupPin(true);
      return;
    }
    setPinPending(false);
    setAuthenticated(true);
  }

  async function requestOtp() {
    setLoading(true);
    setError(null);
    try {
      const msisdn = normalizeLoginPhone(phone);
      if (!/^\+243\d{9}$/.test(msisdn)) {
        setError("Numéro invalide. Format : +243XXXXXXXXX");
        return;
      }
      if (!pinMode) {
        const enabled = await fetchPinEnabled(apiFetch, msisdn);
        if (enabled) {
          setPinMode(true);
          return;
        }
      }
      await apiFetch("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone: msisdn, intendedRole: "PASSENGER" }),
      }, { useMock: mock });
      setCode("");
      setCodeSent(true);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(toUserErrorMessage(
        e,
        status === 503 || status >= 500
          ? LOGIN_OTP_UNAVAILABLE
          : "Impossible d'envoyer le code. Réessayez.",
      ));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AuthPayload & {
        otpRequired?: boolean;
        challengeId?: string;
        otpChannel?: string;
        destinationMasked?: string;
        mockCode?: string;
      }>("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken, intendedRole: "PASSENGER" }),
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
      completeSession(data);
    } catch (e) {
      setError(toUserErrorMessage(e, LOGIN_GOOGLE_UNAVAILABLE));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPin() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AuthPayload>("/api/auth/pin/login", {
        method: "POST",
        body: JSON.stringify({
          phone: normalizeLoginPhone(phone),
          pin,
          intendedRole: "PASSENGER",
        }),
      }, { useMock: mock });
      completeSession(data);
    } catch (e) {
      setError(toUserErrorMessage(e, "PIN incorrect. Réessayez ou utilisez le code SMS."));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const data = googleChallenge
        ? await apiFetch<AuthPayload>("/api/auth/google/verify", {
            method: "POST",
            body: JSON.stringify({
              challengeId: googleChallenge.id,
              code: code.trim(),
              intendedRole: "PASSENGER",
            }),
          }, { useMock: mock })
        : await apiFetch<AuthPayload>("/api/auth/otp/verify", {
            method: "POST",
            body: JSON.stringify({
              phone: normalizeLoginPhone(phone),
              code: code.trim(),
              intendedRole: "PASSENGER",
            }),
          }, { useMock: mock });
      completeSession(data);
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

  if (setupPin && !authenticated) {
    return (
      <PinSetupForm
        apiFetchFn={apiFetch}
        onDone={() => {
          setPinPending(false);
          setSetupPin(false);
          setAuthenticated(true);
        }}
      />
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
            : pinMode
              ? "Entrez votre code PIN à 6 chiffres, ou demandez un SMS."
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
          onChange={(e) => {
            setPhone(e.target.value);
            setPinMode(false);
            setPin("");
          }}
          disabled={codeSent || Boolean(googleChallenge)}
        />
        {pinMode && !codeSent && (
          <input
            className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3 tracking-widest"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="PIN à 6 chiffres"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
          />
        )}
        {codeSent && (
          <input
            className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            placeholder={googleChallenge?.channel === "email" ? "Code reçu par e-mail" : "Code à 6 chiffres"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
        )}
        <button
          type="button"
          onClick={codeSent ? verifyOtp : pinMode && pin.length === 6 ? loginWithPin : requestOtp}
          disabled={
            loading ||
            (!googleChallenge && !phone.trim()) ||
            (codeSent && !code.trim()) ||
            (pinMode && !codeSent && pin.length > 0 && pin.length !== 6)
          }
          className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
        >
          {loading
            ? "Chargement…"
            : codeSent
              ? "Se connecter"
              : pinMode
                ? "Se connecter avec le PIN"
                : "Continuer"}
        </button>
        {pinMode && !codeSent && (
          <button
            type="button"
            className="w-full mt-3 text-sm text-gray-500 underline"
            onClick={() => {
              setPinMode(false);
              setPin("");
              void requestOtp();
            }}
          >
            Recevoir un code SMS
          </button>
        )}
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
