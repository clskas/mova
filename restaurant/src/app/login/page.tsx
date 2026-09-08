"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearLastPhone,
  decodeJwtPayload,
  dropTokenKeepPhone,
  getLastPhone,
  getToken,
  isPinPending,
  isPinSessionUnlocked,
  isRestaurantRole,
  normalizeLoginPhone,
  phoneFromToken,
  RESTAURANT_AUTH_INTENT,
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
  ACTIVATION_PIN_HEADING_FR,
  ActivationPinCard,
  AuthPayload,
  GOOGLE_OPTIONAL_LABEL_FR,
  PartnerLoginHelp,
  PinForgotLink,
  PinSetupForm,
  accountPhone,
  isEmailIdentity,
  mustSetupPinAfterPhoneLogin,
  shouldRequirePinSetup,
} from "@/components/PinAuth";

const API_BASE = PUBLIC_API_BASE;
const INTENT = RESTAURANT_AUTH_INTENT;

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
  const [codeSent, setCodeSent] = useState(false);
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

  const showActivation = !codeSent && !setupToken && !forgotPin && !googleChallenge;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = getToken();
      if (token && (isPinPending() || setupToken)) {
        if (!setupToken) setSetupToken(token);
        return;
      }
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/api/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const me = res.ok ? await res.json() : null;
          if (cancelled) return;
          if (
            me &&
            shouldRequirePinSetup(
              {
                pinConfigured: me.pinConfigured,
                needsPinSetup: me.needsPinSetup,
                phone: me.phone,
                hasPhone: me.hasPhone,
                user: me,
              },
              me.phone || phoneFromToken() || getLastPhone() || "",
              token,
            )
          ) {
            setPinPending(true);
            setSetupToken(token);
            return;
          }
          const remembered = accountPhone(
            { pinConfigured: me?.pinConfigured, phone: me?.phone, hasPhone: me?.hasPhone, user: me, email: me?.email },
            phoneFromToken() || getLastPhone() || "",
          );
          if (me?.pinConfigured && !isPinSessionUnlocked()) {
            if (remembered) setPhone(remembered);
            return;
          }
          if (me && isPinSessionUnlocked()) {
            router.replace("/");
            return;
          }
        } catch {
          dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
        }
      }
      const last = getLastPhone();
      if (last) setPhone(last);
    })();
    return () => {
      cancelled = true;
    };
  }, [setupToken, router]);

  function finishRestaurantSession(data: AuthPayload, source: "pin" | "google" | "otp") {
    if (!data.accessToken) {
      throw new Error(LOGIN_GOOGLE_UNAVAILABLE);
    }
    const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
    if (!isRestaurantRole(typeof role === "string" ? role : null)) {
      throw new Error("Ce compte n'est pas un partenaire restaurant.");
    }
    const typedPhone = source === "google" ? "" : normalizeLoginPhone(phone);
    const phoneOnAccount = accountPhone(data, typedPhone);
    setToken(data.accessToken, phoneOnAccount || undefined);
    if (phoneOnAccount) setLastPhone(phoneOnAccount);
    if (
      forgotPin ||
      mustSetupPinAfterPhoneLogin(data, typedPhone, source !== "google") ||
      shouldRequirePinSetup(data, phoneOnAccount, data.accessToken)
    ) {
      setPinPending(true);
      setSetupToken(data.accessToken);
      return;
    }
    setPinPending(false);
    if (source === "google") {
      router.replace("/compte");
      return;
    }
    markPinSessionUnlocked();
    router.replace("/");
  }

  async function requestOtp() {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      const msisdn = normalizeLoginPhone(phone);
      if (isEmailIdentity(msisdn)) {
        setError("Saisissez le PIN d'activation reçu par e-mail, ou utilisez Google si le compte est déjà lié.");
        return;
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
      finishRestaurantSession(data, "google");
    } catch (e) {
      setError(toUserErrorMessage(e, LOGIN_GOOGLE_UNAVAILABLE));
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
      finishRestaurantSession(data, "otp");
    } catch (e) {
      setError(toUserErrorMessage(e, lastStatus >= 500 ? LOGIN_GENERIC : "Connexion impossible. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto flex items-start justify-center px-4 py-8 bg-gradient-to-br from-orange-50 to-violet-50">
      <PwaInstallBanner accentClass="bg-[#FF6B35]" />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8 space-y-5">
        <div className="text-center">
          <div className="text-3xl mb-2">🍽️</div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">SENGA Restaurant</h1>
          <p className="text-sm text-gray-600 mt-1">
            {setupToken
              ? "Créez votre code PIN"
              : forgotPin && codeSent
                ? "Code SMS envoyé. Vous définirez ensuite un nouveau PIN."
                : forgotPin
                  ? "Récupérez l'accès par SMS (vous pouvez changer de numéro) ou avec Google, puis définissez un nouveau PIN."
                  : googleChallenge
                    ? "Confirmez le code reçu, puis activez avec le PIN KYC si demandé."
                    : null}
          </p>
        </div>
        {setupToken ? (
          <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-orange-50 to-violet-50 overflow-y-auto">
            <div className="min-h-[100dvh] flex items-start justify-center p-6 pt-10">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
                <PinSetupForm
                  apiBase={API_BASE}
                  token={setupToken}
                  accentClass="bg-[#FF6B35]"
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
        ) : showActivation ? (
          <>
            <ActivationPinCard
              apiBase={API_BASE}
              intent={{ ...INTENT }}
              accentClass="bg-[#FF6B35]"
              highlightClass="border-orange-400 bg-orange-50"
              heading={ACTIVATION_PIN_HEADING_FR}
              defaultIdentity={phone}
              normalizeIdentity={normalizeLoginPhone}
              onActivated={(data) => finishRestaurantSession(data, "pin")}
            />
            {googleClientId() && (
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <p className="text-center text-sm font-medium text-gray-600">{GOOGLE_OPTIONAL_LABEL_FR}</p>
                <GoogleContinueButton onCredential={loginWithGoogle} disabled={loading} />
              </div>
            )}
            <PinForgotLink
              disabled={loading}
              onClick={() => {
                setForgotPin(true);
                setError(null);
              }}
            />
            <PartnerLoginHelp />
          </>
        ) : (
          <>
            <label className="block text-sm">
              <span className="text-gray-600">Téléphone (+243) ou e-mail</span>
              <input
                data-testid="login-phone"
                className="mt-1 w-full rounded-xl border border-gray-200 p-3"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
                  {googleChallenge?.channel === "email"
                    ? `Code reçu par e-mail${googleChallenge.masked ? ` (${googleChallenge.masked})` : ""}`
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
              onClick={() => (codeSent ? void verifyOtp() : void requestOtp())}
              className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
            >
              {loading ? (codeSent ? "Connexion…" : "Envoi…") : codeSent ? "Se connecter" : "Recevoir un SMS"}
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
                Retour au PIN d&apos;activation
              </button>
            )}
            {googleClientId() && !codeSent && !googleChallenge && (
              <>
                <p className="text-center text-sm font-medium text-gray-600">{GOOGLE_OPTIONAL_LABEL_FR}</p>
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
                  if (forgotPin && getLastPhone()) {
                    setForgotPin(false);
                  }
                }}
              >
                {googleChallenge ? "Retour" : "Retour au PIN d'activation"}
              </button>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
