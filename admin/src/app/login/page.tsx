"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decodeJwtPayload,
  getLastPhone,
  getToken,
  isPinPending,
  normalizeLoginPhone,
  roleFromToken,
  setLastPhone,
  setPinPending,
  setToken,
} from "@/lib/auth";
import { sanitizeAdminError, toUserErrorMessage } from "@/lib/api";
import { defaultPathForRole, isAdminRole, normalizeAdminRole } from "@/lib/rbac";
import { GoogleContinueButton, googleClientId } from "@/components/GoogleContinueButton";
import {
  AuthPayload,
  PinForgotLink,
  PinSetupForm,
  fetchPinEnabled,
  loginWithPinRequest,
  shouldRequirePinSetup,
} from "@/components/PinAuth";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
const isProd = process.env.NODE_ENV === "production";
const ADMIN_PHONE = process.env.NEXT_PUBLIC_ADMIN_PHONE ?? (isProd ? "" : "+243900000001");

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"otp" | "token">("otp");
  const [phone, setPhone] = useState(ADMIN_PHONE);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [forgotPin, setForgotPin] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(() =>
    typeof window !== "undefined" && isPinPending() ? getToken() : null,
  );
  const [setupRolePath, setSetupRolePath] = useState("/");
  const [googleChallenge, setGoogleChallenge] = useState<{
    id: string;
    channel: string;
    masked: string;
  } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token && (isPinPending() || setupToken)) {
      const role = normalizeAdminRole(roleFromToken(token));
      if (role) setSetupRolePath(defaultPathForRole(role));
      if (!setupToken) setSetupToken(token);
      return;
    }
    if (token) {
      void fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => {
          if (!me) return;
          if (shouldRequirePinSetup({ pinConfigured: me.pinConfigured, user: me }, me.phone)) {
            setPinPending(true);
            setSetupToken(token);
            const role = normalizeAdminRole(me.role ?? roleFromToken(token));
            if (role) setSetupRolePath(defaultPathForRole(role));
          }
        })
        .catch(() => undefined);
      return;
    }
    const last = getLastPhone();
    if (last) {
      setPhone(last);
      void fetchPinEnabled(API_BASE, last, { role: "ADMIN" }).then((enabled) => {
        if (enabled) setPinMode(true);
      });
    }
  }, [setupToken]);

  async function requestOtp(opts?: { forceSms?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const msisdn = normalizeLoginPhone(phone);
      if (!opts?.forceSms && !pinMode) {
        const enabled = await fetchPinEnabled(API_BASE, msisdn, { role: "ADMIN" });
        if (enabled) {
          setPinMode(true);
          return;
        }
      }
      const requestRes = await fetch(`${API_BASE}/api/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: msisdn, role: "ADMIN" }),
      });
      if (!requestRes.ok) {
        const body = await requestRes.json().catch(() => ({}));
        throw new Error(
          sanitizeAdminError(body.error?.message ?? "Impossible d'envoyer le code. Réessayez.", requestRes.status),
        );
      }
      setCode("");
      setCodeSent(true);
    } catch (e) {
      setError(toUserErrorMessage(e, "Impossible d'envoyer le code. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  function finishAdminSession(data: AuthPayload) {
    const role = normalizeAdminRole(data.user?.role);
    if (!role) {
      throw new Error("Ce compte n'a pas un rôle staff autorisé.");
    }
    if (!data.accessToken) {
      throw new Error("Connexion Google impossible pour le moment. Réessayez.");
    }
    const typedPhone = googleChallenge ? "" : normalizeLoginPhone(phone);
    const phoneOnAccount = (data.user?.phone ?? typedPhone).trim();
    setToken(data.accessToken, phoneOnAccount || undefined);
    if (phoneOnAccount) setLastPhone(phoneOnAccount);
    if (forgotPin || shouldRequirePinSetup(data, phoneOnAccount)) {
      setPinPending(true);
      setSetupRolePath(defaultPathForRole(role));
      setSetupToken(data.accessToken);
      return;
    }
    setPinPending(false);
    router.replace(defaultPathForRole(role));
  }

  async function loginWithGoogle(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      const verifyRes = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, role: "ADMIN" }),
      });
      const data = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(
          sanitizeAdminError(data.error?.message ?? "Connexion Google impossible pour le moment. Réessayez.", verifyRes.status),
        );
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
      finishAdminSession(data);
    } catch (e) {
      setError(toUserErrorMessage(e, "Connexion Google impossible pour le moment. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithOtp() {
    setLoading(true);
    setError(null);
    try {
      const verifyRes = await fetch(
        googleChallenge ? `${API_BASE}/api/auth/google/verify` : `${API_BASE}/api/auth/otp/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            googleChallenge
              ? { challengeId: googleChallenge.id, code: code.trim(), role: "ADMIN" }
              : { phone: normalizeLoginPhone(phone), code: code.trim(), role: "ADMIN" },
          ),
        },
      );
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.accessToken) {
        throw new Error(
          sanitizeAdminError(data.error?.message ?? "Connexion impossible. Réessayez.", verifyRes.status),
        );
      }
      finishAdminSession(data);
    } catch (e) {
      setError(toUserErrorMessage(e, "Connexion impossible. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPin() {
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithPinRequest(API_BASE, normalizeLoginPhone(phone), pin, { role: "ADMIN" });
      if (!result.ok) {
        throw new Error(result.data.error?.message ?? "PIN incorrect. Réessayez ou utilisez le code SMS.");
      }
      finishAdminSession(result.data);
    } catch (e) {
      setError(toUserErrorMessage(e, "PIN incorrect. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  function loginWithToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setError("Collez un jeton d'accès valide");
      return;
    }
    const payload = decodeJwtPayload(trimmed);
    if (!isAdminRole(typeof payload?.role === "string" ? payload.role : null)) {
      setError("Ce jeton n'a pas un rôle staff autorisé");
      return;
    }
    setToken(trimmed);
    router.replace(defaultPathForRole(normalizeAdminRole(String(payload?.role))!));
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <aside
        className="relative lg:w-[42%] xl:w-[38%] text-white px-8 py-10 lg:px-12 lg:py-14 flex flex-col justify-between overflow-hidden"
        style={{ background: "var(--sidebar-gradient)" }}
      >
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/5 blur-2xl" aria-hidden />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" aria-hidden />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={44} height={44} className="rounded-xl shadow-lg" />
            <div>
              <p className="text-xl font-semibold tracking-tight">SENGA Admin</p>
              <p className="text-sm text-white/60">Console d&apos;administration</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-10 lg:mt-0 space-y-6 max-w-md">
          <div>
            <h1 className="text-3xl lg:text-4xl font-semibold leading-tight">
              Mobilité urbaine,
              <span className="block text-violet-300">couverture nationale RDC</span>
            </h1>
            <p className="mt-4 text-sm lg:text-base text-white/70 leading-relaxed">
              Courses, livraisons, KYC chauffeurs, tarifs et opérations — un seul back-office sécurisé pour votre équipe.
            </p>
          </div>
          <ul className="space-y-3 text-sm text-white/75">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Accès par rôle (Super Admin, Support, Finance…)
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Suivi GPS et traces en temps réel
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Données en francs congolais (CDF)
            </li>
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/40 mt-8 lg:mt-0">© SENGA — République Démocratique du Congo</p>
      </aside>

      <main className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-[var(--background)]">
        <div className="w-full max-w-md mova-card p-8 sm:p-10 shadow-mova space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-mova-midnight">Connexion</h2>
            <p className="text-sm text-gray-500 mt-1">Accès réservé au personnel autorisé</p>
          </div>

          {!isProd && (
          <div className="flex gap-1.5 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode("otp")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "otp" ? "bg-white text-mova-midnight shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              OTP téléphone
            </button>
            <button
              type="button"
              onClick={() => setMode("token")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "token" ? "bg-white text-mova-midnight shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              JWT dev
            </button>
          </div>
          )}

          {setupToken ? (
            <PinSetupForm
              apiBase={API_BASE}
              token={setupToken}
              reset={forgotPin}
              onDone={() => {
                setPinPending(false);
                setForgotPin(false);
                router.replace(setupRolePath);
              }}
            />
          ) : mode === "otp" ? (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Téléphone admin</span>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-mova-midnight outline-none transition focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPinMode(false);
                    setPin("");
                  }}
                  placeholder="+243 …"
                  autoComplete="tel"
                  disabled={codeSent || Boolean(googleChallenge)}
                />
              </label>
              {pinMode && !codeSent && (
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Entrez votre code PIN</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 tracking-widest outline-none transition focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={6}
                  />
                </label>
              )}
              {codeSent && (
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">
                    {googleChallenge?.channel === "email"
                      ? `code reçu par e-mail${googleChallenge.masked ? ` (${googleChallenge.masked})` : ""}`
                      : "code reçu par SMS"}
                  </span>
                  <input
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-mova-midnight outline-none transition focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
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
                onClick={() => {
                  if (codeSent) void loginWithOtp();
                  else if (pinMode && pin.length === 6) void loginWithPin();
                  else void requestOtp();
                }}
                className="mova-btn-primary w-full"
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
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">JWT (Bearer token)</span>
                <textarea
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-xs h-32 outline-none transition focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                />
              </label>
              <button type="button" onClick={loginWithToken} className="mova-btn-primary w-full">
                Utiliser ce token
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-center">{error}</div>
          )}

          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Téléphone : code par SMS. Google : code par e-mail (boîte Google), même si un numéro est lié.
            Après la première connexion avec un téléphone, le PIN à 6 chiffres est obligatoire. PIN oublié : un SMS
            permet de définir un nouveau code.
          </p>
        </div>
      </main>
    </div>
  );
}
