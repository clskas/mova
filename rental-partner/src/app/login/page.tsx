"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RENTAL_AUTH_INTENT,
  clearLastPhone,
  decodeJwtPayload,
  dropTokenKeepPhone,
  getLastPhone,
  getToken,
  isPinPending,
  isRentalPartnerRole,
  normalizeLoginPhone,
  phoneFromToken,
  isPinSessionUnlocked,
  markLoginPinConfirmed,
  setPinPending,
  setLastPhone,
  setToken,
} from "@/lib/auth";
import { GoogleContinueButton, disableGoogleAutoSelect, googleClientId } from "@/components/GoogleContinueButton";
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
  GOOGLE_OPTIONAL_LABEL_FR,
  LOGIN_CLASSIC_LABEL_FR,
  LOGIN_IDENTITY_LABEL_FR,
  PartnerLoginHelp,
  CONNECTION_LOGIN_TITLE_FR,
  CONNECTION_PIN_FOOTER_FR,
  CONNECTION_PIN_HEADING_FR,
  PIN_SETUP_HINT_FR,
  connectionPinPrompt,
  PinDigitPad,
  PinForgotLink,
  PinSetupForm,
  accountPhone,
  fetchPinEnabled,
  isEmailIdentity,
  jwtNeedsPinSetup,
  loginWithPinRequest,
  mustSetupPinAfterPhoneLogin,
  shouldRequirePinSetup,
} from "@/components/PinAuth";

const API_BASE = PUBLIC_API_BASE;
const INTENT = RENTAL_AUTH_INTENT;

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
  const pinSubmitLock = useRef(false);

  const pinOnly = pinMode && !codeSent && !googleChallenge && !setupToken && !forgotPin;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = getToken();
      if (token && (isPinPending() || setupToken || jwtNeedsPinSetup(token))) {
        if (!setupToken) setSetupToken(token);
        setPinPending(true);
        return;
      }
      if (token && isPinSessionUnlocked()) {
        try {
          const res = await fetch(`${API_BASE}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const me = res.ok ? await res.json() : null;
          if (cancelled) return;
          if (me) {
            router.replace("/");
            return;
          }
        } catch {
          dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
        }
      } else if (token) {
        dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
      }
      disableGoogleAutoSelect();
      const last = getLastPhone();
      if (last) {
        setPhone(last);
        setPinMode(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setupToken, router]);

  useEffect(() => {
    if (pinOnly && pin.length === 6 && !loading && phone.trim()) {
      void loginWithPin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-submit when pad reaches 6 digits
  }, [pin, pinOnly, phone]);

  function finishRentalSession(data: AuthPayload, source: "pin" | "google" | "otp") {
    if (!data.accessToken) {
      throw new Error(LOGIN_GOOGLE_UNAVAILABLE);
    }
    const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
    if (!isRentalPartnerRole(typeof role === "string" ? role : null)) {
      throw new Error("Ce compte n'est pas un partenaire location.");
    }
    const typedPhone = source === "google" ? "" : normalizeLoginPhone(phone);
    const phoneOnAccount = accountPhone(data, typedPhone);
    setToken(data.accessToken, phoneOnAccount || undefined);
    if (phoneOnAccount) {
      setLastPhone(phoneOnAccount);
      if (!phone.trim()) setPhone(phoneOnAccount);
    }
    const needsSetup =
      forgotPin ||
      mustSetupPinAfterPhoneLogin(data, typedPhone, source === "otp" && !googleChallenge) ||
      shouldRequirePinSetup(data, phoneOnAccount, data.accessToken);
    if (needsSetup) {
      setPinPending(true);
      setSetupToken(data.accessToken);
      setCodeSent(false);
      setGoogleChallenge(null);
      return;
    }
    if (source !== "pin" && data.pinConfigured === true) {
      setPinMode(true);
      setCodeSent(false);
      setGoogleChallenge(null);
      setPin("");
      return;
    }
    setPinPending(false);
    markLoginPinConfirmed();
    router.replace("/");
  }

  async function requestOtp(opts?: { forceSms?: boolean }) {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      const msisdn = normalizeLoginPhone(phone);
      const emailLogin = isEmailIdentity(msisdn);
      if (!emailLogin && !/^\+243\d{9}$/.test(msisdn) && !forgotPin) {
        setError("Numéro invalide. Format : +243XXXXXXXXX");
        return;
      }
      if (!opts?.forceSms && !pinMode && !forgotPin) {
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
      finishRentalSession(data, "google");
    } catch (e) {
      setError(toUserErrorMessage(e, LOGIN_GOOGLE_UNAVAILABLE));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPin() {
    if (pinSubmitLock.current) return;
    pinSubmitLock.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithPinRequest(API_BASE, normalizeLoginPhone(phone), pin, INTENT);
      if (!result.ok) {
        throw new Error(result.data.error?.message ?? "PIN incorrect. Réessayez ou utilisez le code SMS.");
      }
      finishRentalSession(result.data, "pin");
    } catch (e) {
      setError(toUserErrorMessage(e, "PIN incorrect. Réessayez."));
      setPin("");
    } finally {
      pinSubmitLock.current = false;
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
      finishRentalSession(data, "otp");
    } catch (e) {
      setError(toUserErrorMessage(e, lastStatus >= 500 ? LOGIN_GENERIC : "Connexion impossible. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  function useAnotherNumber() {
    clearLastPhone();
    setPhone("");
    setPin("");
    setPinMode(false);
    setForgotPin(false);
    setCodeSent(false);
    setCode("");
    setError(null);
  }

  return (
    <div className="min-h-screen overflow-y-auto flex items-start justify-center px-4 py-8 bg-gradient-to-br from-indigo-50 to-violet-50">
      <PwaInstallBanner accentClass="bg-indigo-600" />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8 space-y-5">
        <div className="text-center">
          <div className="text-3xl mb-2">🚗</div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">SENGA Location</h1>
          <p className="text-sm text-gray-600 mt-1">
            {setupToken || pinOnly
              ? PIN_SETUP_HINT_FR
              : forgotPin && codeSent
                  ? "Code SMS envoyé. Vous définirez ensuite un nouveau PIN de connexion."
                  : forgotPin
                    ? "Récupérez l'accès par SMS (vous pouvez changer de numéro) ou avec Google, puis définissez un nouveau PIN."
                    : googleChallenge
                      ? "Saisissez le code reçu par e-mail, puis votre PIN de connexion."
                      : "Connectez-vous avec Google ou votre téléphone."}
          </p>
        </div>
        {setupToken ? (
          <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-indigo-50 to-violet-50 overflow-y-auto">
            <div className="min-h-[100dvh] flex items-start justify-center p-6 pt-10">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-4">
                <PinSetupForm
                  apiBase={API_BASE}
                  token={setupToken}
                  accentClass="bg-indigo-600"
                  reset={forgotPin}
                  onDone={() => {
                    setPinPending(false);
                    setForgotPin(false);
                    markLoginPinConfirmed();
                    router.replace("/");
                  }}
                />
              </div>
            </div>
          </div>
        ) : pinOnly ? (
          <div className="fixed inset-0 z-[10050] bg-[#F5F5F7] overflow-y-auto">
            <div className="min-h-[100dvh] flex items-center justify-center p-6">
              <div className="w-full max-w-sm space-y-5">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-[#1A1A2E]">{CONNECTION_LOGIN_TITLE_FR}</h1>
                  <p className="text-sm text-gray-500 mt-1">{connectionPinPrompt(phone)}</p>
                </div>
                <PinDigitPad
                  value={pin}
                  onChange={setPin}
                  disabled={loading}
                  accentClass="bg-indigo-600"
                  keypadOnly
                  autoFocus
                />
                <PinForgotLink
                  disabled={loading}
                  onClick={() => {
                    setForgotPin(true);
                    setPinMode(false);
                    setPin("");
                    setError(null);
                  }}
                />
                <button type="button" className="w-full text-sm text-[#6C63FF] underline" onClick={useAnotherNumber}>
                  Ce n&apos;est pas moi
                </button>
                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                <p className="text-xs text-gray-400 text-center leading-relaxed">{CONNECTION_PIN_FOOTER_FR}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {googleClientId() && !codeSent && !googleChallenge && (
              <div className="space-y-2">
                <p className="text-center text-sm font-medium text-gray-600">{GOOGLE_OPTIONAL_LABEL_FR}</p>
                <GoogleContinueButton onCredential={loginWithGoogle} disabled={loading} />
              </div>
            )}
            <p className="text-center text-sm font-medium text-gray-500">{LOGIN_CLASSIC_LABEL_FR}</p>
            <label className="block text-sm">
              <span className="text-gray-600">{LOGIN_IDENTITY_LABEL_FR}</span>
              <input
                data-testid="login-phone"
                className="mt-1 w-full rounded-xl border border-gray-200 p-3"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPinMode(false);
                  setPin("");
                }}
                placeholder="+243 8XX XXX XXX ou e-mail"
                type="text"
                inputMode="text"
                autoComplete="username"
                disabled={codeSent || Boolean(googleChallenge)}
              />
            </label>
            {forgotPin && !codeSent && !googleChallenge && (
              <button
                type="button"
                className="w-full text-sm text-gray-500 underline"
                onClick={() => {
                  setPhone("");
                  clearLastPhone();
                  setError(null);
                }}
              >
                Utiliser un autre numéro
              </button>
            )}
            {codeSent && (
              <label className="block text-sm">
                <span className="text-gray-600">
                  {googleChallenge?.channel === "email" || isEmailIdentity(phone)
                    ? `Code reçu par e-mail${googleChallenge?.masked ? ` (${googleChallenge.masked})` : ""}`
                    : forgotPin
                      ? "Code SMS — vous définirez ensuite un nouveau PIN"
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
                disabled={loading || (!googleChallenge && !phone.trim()) || (codeSent && !code.trim())}
                onClick={() => (codeSent ? void verifyOtp() : void requestOtp({ forceSms: forgotPin }))}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
              >
                {loading
                  ? codeSent
                    ? "Connexion…"
                    : "Envoi…"
                  : codeSent
                    ? "Valider le code"
                    : forgotPin
                      ? isEmailIdentity(phone)
                        ? "Recevoir le code"
                        : "Recevoir un SMS"
                      : "Continuer"}
              </button>
            {forgotPin && !codeSent && !googleChallenge && (
              <button
                type="button"
                className="w-full text-sm text-gray-400 underline"
                onClick={() => {
                  setForgotPin(false);
                  setError(null);
                }}
              >
                Retour à la connexion
              </button>
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
                {googleChallenge ? "Retour" : isEmailIdentity(phone) ? "Changer d'e-mail" : "Changer de numéro"}
              </button>
            )}
            <PartnerLoginHelp />
          </>
        )}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
