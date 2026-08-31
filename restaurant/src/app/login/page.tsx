"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decodeJwtPayload, isRestaurantRole, normalizeLoginPhone, setToken } from "@/lib/auth";
import { GoogleContinueButton, googleClientId } from "@/components/GoogleContinueButton";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  LOGIN_GENERIC,
  LOGIN_GOOGLE_UNAVAILABLE,
  LOGIN_OTP_UNAVAILABLE,
  toUserErrorMessage,
} from "@/lib/user-messages";
import {
  AuthPayload,
  PinSetupForm,
  fetchPinEnabled,
  loginWithPinRequest,
  shouldRequirePinSetup,
} from "@/components/PinAuth";

const API_BASE = PUBLIC_API_BASE;
const INTENT = { role: "RESTAURANT", intendedRole: "RESTAURANT", portal: "restaurant" };

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error?.message ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [googleChallenge, setGoogleChallenge] = useState<{
    id: string;
    channel: string;
    masked: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function finishRestaurantSession(data: AuthPayload) {
    if (!data.accessToken) {
      throw new Error(LOGIN_GOOGLE_UNAVAILABLE);
    }
    const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
    if (!isRestaurantRole(typeof role === "string" ? role : null)) {
      throw new Error("Ce compte n'est pas un partenaire restaurant.");
    }
    setToken(data.accessToken);
    if (shouldRequirePinSetup(data)) {
      setSetupToken(data.accessToken);
      return;
    }
    router.replace("/");
  }

  async function requestOtp() {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      const msisdn = normalizeLoginPhone(phone);
      if (!pinMode) {
        const enabled = await fetchPinEnabled(API_BASE, msisdn, INTENT);
        if (enabled) {
          setPinMode(true);
          return;
        }
      }
      let requestRes: Response;
      try {
        requestRes = await fetch(`${API_BASE}/api/auth/otp/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: msisdn, purpose: "LOGIN", ...INTENT }),
        });
      } catch {
        throw new Error(LOGIN_OTP_UNAVAILABLE);
      }
      lastStatus = requestRes.status;
      if (!requestRes.ok) {
        throw new Error(await readErrorMessage(requestRes, LOGIN_OTP_UNAVAILABLE));
      }
      setCode("");
      setCodeSent(true);
    } catch (e) {
      setError(toUserErrorMessage(e, lastStatus >= 500 ? LOGIN_OTP_UNAVAILABLE : "Impossible d'envoyer le code. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      const verifyRes = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, ...INTENT }),
      });
      const data = (await verifyRes.json().catch(() => ({}))) as AuthPayload & {
        otpRequired?: boolean;
        challengeId?: string;
        otpChannel?: string;
        destinationMasked?: string;
        mockCode?: string;
        error?: { message?: string };
      };
      if (!verifyRes.ok) {
        throw new Error(data.error?.message ?? LOGIN_GOOGLE_UNAVAILABLE);
      }
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
      finishRestaurantSession(data);
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
      const result = await loginWithPinRequest(API_BASE, normalizeLoginPhone(phone), pin, INTENT);
      if (!result.ok) {
        throw new Error(result.data.error?.message ?? "PIN incorrect. Réessayez ou utilisez le code SMS.");
      }
      finishRestaurantSession(result.data);
    } catch (e) {
      setError(toUserErrorMessage(e, "PIN incorrect. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      let verifyRes: Response;
      try {
        verifyRes = await fetch(
          googleChallenge ? `${API_BASE}/api/auth/google/verify` : `${API_BASE}/api/auth/otp/verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              googleChallenge
                ? { challengeId: googleChallenge.id, code: code.trim(), ...INTENT }
                : { phone: normalizeLoginPhone(phone), code: code.trim(), ...INTENT },
            ),
          },
        );
      } catch {
        throw new Error(LOGIN_GENERIC);
      }
      lastStatus = verifyRes.status;
      const data = (await verifyRes.json().catch(() => {
        throw new Error(LOGIN_GENERIC);
      })) as AuthPayload & { error?: { message?: string } };
      if (!verifyRes.ok || !data.accessToken) {
        throw new Error(data.error?.message ?? LOGIN_GENERIC);
      }
      finishRestaurantSession(data);
    } catch (e) {
      setError(toUserErrorMessage(e, lastStatus >= 500 ? LOGIN_GENERIC : "Connexion impossible. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  function primaryAction() {
    if (setupToken) return;
    if (codeSent) return void verifyOtp();
    if (pinMode && pin.length === 6) return void loginWithPin();
    return void requestOtp();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-orange-50 to-violet-50">
      <PwaInstallBanner accentClass="bg-[#FF6B35]" />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="text-3xl mb-2">🍽️</div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">SENGA Restaurant</h1>
          <p className="text-sm text-gray-500 mt-1">
            {setupToken
              ? "Créez votre code PIN"
              : "Portail partenaire livraison repas"}
          </p>
        </div>
        {setupToken ? (
          <PinSetupForm
            apiBase={API_BASE}
            token={setupToken}
            accentClass="bg-[#FF6B35]"
            onDone={() => router.replace("/")}
          />
        ) : (
          <>
            <label className="block text-sm">
              <span className="text-gray-600">Téléphone partenaire</span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200 p-3"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPinMode(false);
                  setPin("");
                }}
                placeholder="+243 8XX XXX XXX"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                disabled={codeSent || Boolean(googleChallenge)}
              />
            </label>
            {pinMode && !codeSent && (
              <label className="block text-sm">
                <span className="text-gray-600">Code PIN</span>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-200 p-3 tracking-widest"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 chiffres"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={6}
                />
              </label>
            )}
            {codeSent && (
              <label className="block text-sm">
                <span className="text-gray-600">
                  {googleChallenge?.channel === "email"
                    ? `Code reçu par e-mail${googleChallenge.masked ? ` (${googleChallenge.masked})` : ""}`
                    : "Code reçu par SMS"}
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-200 p-3"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Code à 6 chiffres"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
              </label>
            )}
            <button
              type="button"
              disabled={
                loading ||
                (!googleChallenge && !phone.trim()) ||
                (codeSent && !code.trim()) ||
                (pinMode && !codeSent && pin.length > 0 && pin.length !== 6)
              }
              onClick={primaryAction}
              className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
            >
              {loading
                ? codeSent || pinMode
                  ? "Connexion…"
                  : "Envoi…"
                : codeSent
                  ? "Se connecter"
                  : pinMode
                    ? "Se connecter avec le PIN"
                    : "Continuer"}
            </button>
            {pinMode && !codeSent && (
              <button
                type="button"
                className="w-full text-sm text-gray-500 underline"
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
                <p className="text-center text-xs text-gray-400">ou</p>
                <GoogleContinueButton onCredential={loginWithGoogle} disabled={loading} />
              </>
            )}
            {codeSent && (
              <button
                type="button"
                className="w-full text-sm text-gray-500 underline"
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
          </>
        )}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        {!setupToken && (
          <p className="text-xs text-gray-400 text-center">
            Numéro +243 : le code arrive par SMS. Après la première connexion, un PIN à 6 chiffres
            sert de connexion rapide (OTP et Google restent disponibles).
          </p>
        )}
      </div>
    </div>
  );
}
