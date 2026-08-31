"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decodeJwtPayload,
  getLastPhone,
  getToken,
  isPinPending,
  isRentalPartnerRole,
  normalizeLoginPhone,
  markPinSessionUnlocked,
  setPinPending,
  setLastPhone,
  setToken,
} from "@/lib/auth";
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
  PinForgotLink,
  PinSetupForm,
  accountPhone,
  fetchPinEnabled,
  loginWithPinRequest,
  mustSetupPinAfterPhoneLogin,
  shouldRequirePinSetup,
} from "@/components/PinAuth";

const API_BASE = PUBLIC_API_BASE;
const INTENT = { role: "RENTAL_PARTNER", intendedRole: "RENTAL_PARTNER", portal: "rental" };

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
  const [forgotPin, setForgotPin] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(() =>
    typeof window !== "undefined" && isPinPending() ? getToken() : null,
  );
  const [googleChallenge, setGoogleChallenge] = useState<{
    id: string;
    channel: string;
    masked: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token && (isPinPending() || setupToken)) {
      if (!setupToken) setSetupToken(token);
      return;
    }
    if (token) {
      void fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => {
          if (
            me &&
            shouldRequirePinSetup(
              { pinConfigured: me.pinConfigured, phone: me.phone, hasPhone: me.hasPhone, user: me },
              me.phone,
            )
          ) {
            setPinPending(true);
            setSetupToken(token);
          }
        })
        .catch(() => undefined);
      return;
    }
    const last = getLastPhone();
    if (last) {
      setPhone(last);
      void fetchPinEnabled(API_BASE, last, INTENT).then((enabled) => {
        if (enabled) setPinMode(true);
      });
    }
  }, [setupToken]);

  function finishRentalSession(data: AuthPayload) {
    if (!data.accessToken) {
      throw new Error(LOGIN_GOOGLE_UNAVAILABLE);
    }
    const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
    if (!isRentalPartnerRole(typeof role === "string" ? role : null)) {
      throw new Error("Ce compte n'est pas un partenaire location.");
    }
    const typedPhone = googleChallenge ? "" : normalizeLoginPhone(phone);
    const phoneOnAccount = accountPhone(data, typedPhone);
    setToken(data.accessToken, phoneOnAccount || undefined);
    if (phoneOnAccount) setLastPhone(phoneOnAccount);
    if (forgotPin || mustSetupPinAfterPhoneLogin(data, typedPhone) || shouldRequirePinSetup(data, phoneOnAccount)) {
      setPinPending(true);
      setSetupToken(data.accessToken);
      return;
    }
    setPinPending(false);
    markPinSessionUnlocked();
    router.replace("/");
  }

  async function requestOtp(opts?: { forceSms?: boolean }) {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      const msisdn = normalizeLoginPhone(phone);
      if (!opts?.forceSms && !pinMode) {
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
      finishRentalSession(data);
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
      finishRentalSession(result.data);
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
      finishRentalSession(data);
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-violet-50">
      <PwaInstallBanner accentClass="bg-indigo-600" />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="text-3xl mb-2">🚗</div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">SENGA Location</h1>
          <p className="text-sm text-gray-500 mt-1">
            {setupToken ? "Créez votre code PIN" : "Portail partenaire — inscription véhicules"}
          </p>
        </div>
        {setupToken ? (
          <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-indigo-50 to-violet-50 overflow-y-auto">
            <div className="min-h-[100dvh] flex items-center justify-center p-6">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
                <PinSetupForm
                  apiBase={API_BASE}
                  token={setupToken}
                  accentClass="bg-indigo-600"
                  reset={forgotPin}
                  onDone={() => {
                    setPinPending(false);
                    setForgotPin(false);
                    markPinSessionUnlocked();
                    router.replace("/");
                  }}
                />
              </div>
            </div>
          </div>
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
                (pinMode && !codeSent && pin.length !== 6)
              }
              onClick={primaryAction}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
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
                  void requestOtp({ forceSms: true });
                }}
              >
                Recevoir un code SMS
              </button>
            )}
            {pinMode && !codeSent && (
              <PinForgotLink
                disabled={loading}
                onClick={() => {
                  setForgotPin(true);
                  setPinMode(false);
                  setPin("");
                  void requestOtp({ forceSms: true });
                }}
              />
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
            est obligatoire. PIN oublié : un SMS permet de définir un nouveau code.
          </p>
        )}
      </div>
    </div>
  );
}
