"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decodeJwtPayload, isRentalPartnerRole, isSeedDemoPhone, normalizeLoginPhone, setToken } from "@/lib/auth";
import { GoogleContinueButton, googleClientId } from "@/components/GoogleContinueButton";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";

const API_BASE = PUBLIC_API_BASE;
const PARTNER_PHONE = process.env.NEXT_PUBLIC_PARTNER_PHONE ?? "+243900000031";

function loginErrorMessage(err: unknown, status?: number): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const trimmed = raw.trim();
  const statusPart = status && status > 0 ? ` (HTTP ${status})` : "";
  const apiHint = ` · API: ${API_BASE}`;
  if (!trimmed) return `Erreur de connexion${statusPart}${apiHint}`;
  if (trimmed.length > 160) {
    return `Erreur de connexion${statusPart}${apiHint}`;
  }
  if (/MOVA_|SENGA_|ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|Failed to fetch|NetworkError|Internal server error|Prisma|NestJS/i.test(trimmed)) {
    return `Erreur de connexion${statusPart || " (réseau)"}${apiHint}`;
  }
  if (status && status > 0 && !trimmed.includes(String(status))) {
    return `${trimmed}${statusPart}${apiHint}`;
  }
  if (!trimmed.includes(API_BASE)) {
    return `${trimmed}${apiHint}`;
  }
  return trimmed;
}

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
  const [phone, setPhone] = useState(PARTNER_PHONE);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [googleChallenge, setGoogleChallenge] = useState<{
    id: string;
    channel: string;
    masked: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      let requestRes: Response;
      try {
        const msisdn = normalizeLoginPhone(phone);
        requestRes = await fetch(`${API_BASE}/api/auth/otp/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: msisdn,
            purpose: "LOGIN",
            role: "RENTAL_PARTNER",
            intendedRole: "RENTAL_PARTNER",
            portal: "rental",
          }),
        });
      } catch {
        throw new Error(
          `Impossible de joindre l'API SENGA (${API_BASE}). Vérifiez la connexion ou attendez le démarrage du serveur.`,
        );
      }
      lastStatus = requestRes.status;
      const seed = isSeedDemoPhone(phone);
      if (!requestRes.ok) {
        const msg = await readErrorMessage(requestRes, `Demande OTP refusée (${requestRes.status})`);
        if (!(seed && (requestRes.status === 429 || requestRes.status >= 500))) {
          throw new Error(msg);
        }
      }
      setCode(seed ? "123456" : "");
      setCodeSent(true);
    } catch (e) {
      setError(loginErrorMessage(e, lastStatus));
    } finally {
      setLoading(false);
    }
  }

  function finishRentalSession(data: { accessToken?: string; user?: { role?: string } }) {
    if (!data.accessToken) {
      throw new Error("Connexion Google refusée");
    }
    const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
    if (!isRentalPartnerRole(typeof role === "string" ? role : null)) {
      throw new Error(`Ce compte n'est pas un partenaire location (rôle: ${String(role ?? "?")}).`);
    }
    setToken(data.accessToken);
    router.replace("/");
  }

  async function loginWithGoogle(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      const verifyRes = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          role: "RENTAL_PARTNER",
          intendedRole: "RENTAL_PARTNER",
          portal: "rental",
        }),
      });
      const data = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(data.error?.message ?? `Connexion Google refusée (${verifyRes.status})`);
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
      setError(loginErrorMessage(e));
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
                ? {
                    challengeId: googleChallenge.id,
                    code: code.trim(),
                    role: "RENTAL_PARTNER",
                    intendedRole: "RENTAL_PARTNER",
                    portal: "rental",
                  }
                : {
                    phone: normalizeLoginPhone(phone),
                    code: code.trim(),
                    role: "RENTAL_PARTNER",
                    intendedRole: "RENTAL_PARTNER",
                    portal: "rental",
                  },
            ),
          },
        );
      } catch {
        throw new Error(
          `Impossible de joindre l'API SENGA lors de la vérification OTP (${API_BASE}).`,
        );
      }
      lastStatus = verifyRes.status;

      let data: { accessToken?: string; user?: { role?: string }; error?: { message?: string } } = {};
      try {
        data = await verifyRes.json();
      } catch {
        throw new Error(
          verifyRes.status === 404
            ? `API introuvable (404). NEXT_PUBLIC_API_URL doit être l'origine du gateway sans /api (${API_BASE}).`
            : `Réponse invalide du serveur (${verifyRes.status}) · API: ${API_BASE}`,
        );
      }
      if (!verifyRes.ok || !data.accessToken) {
        throw new Error(data.error?.message ?? `Connexion refusée (${verifyRes.status})`);
      }
      const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
      if (!isRentalPartnerRole(typeof role === "string" ? role : null)) {
        throw new Error(`Ce compte n'est pas un partenaire location (rôle: ${String(role ?? "?")}).`);
      }
      setToken(data.accessToken);
      router.replace("/");
    } catch (e) {
      setError(loginErrorMessage(e, lastStatus));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-violet-50">
      <PwaInstallBanner accentClass="bg-indigo-600" />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="text-3xl mb-2">🚗</div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">SENGA Location</h1>
          <p className="text-sm text-gray-500 mt-1">Portail partenaire — inscription véhicules</p>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Téléphone partenaire</span>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 p-3"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+243 8XX XXX XXX"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={codeSent || Boolean(googleChallenge)}
          />
        </label>
        {codeSent && (
          <label className="block text-sm">
            <span className="text-gray-600">
              {googleChallenge?.channel === "email"
                ? `Code reçu par e-mail${googleChallenge.masked ? ` (${googleChallenge.masked})` : ""}`
                : isSeedDemoPhone(phone)
                  ? "Code de démo (aucun SMS) : 123456"
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
          onClick={codeSent ? verifyOtp : requestOtp}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
        >
          {loading ? (codeSent ? "Connexion…" : "Envoi…") : codeSent ? "Se connecter" : "Recevoir le code"}
        </button>
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
        {error && <p className="text-sm text-red-600 text-center break-all">{error}</p>}
        <p className="text-xs text-gray-400 text-center">
          {isSeedDemoPhone(phone)
            ? <>Numéro de démo : code <code>123456</code>, pas de SMS.</>
            : "Numéro réel +243 : le code arrive par SMS."}{" "}
          Première connexion (téléphone ou Google) : un compte partenaire location est créé automatiquement. Un seul portefeuille.
        </p>
        <p className="text-[10px] text-gray-300 text-center break-all">API: {API_BASE}</p>
      </div>
    </div>
  );
}
