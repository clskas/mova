"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decodeJwtPayload, isRestaurantRole, isSeedDemoPhone, normalizeLoginPhone, setToken } from "@/lib/auth";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";

const API_BASE = PUBLIC_API_BASE;
const RESTAURANT_PHONE = process.env.NEXT_PUBLIC_RESTAURANT_PHONE ?? "+243900000030";

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
  const [phone, setPhone] = useState(RESTAURANT_PHONE);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
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
          body: JSON.stringify({ phone: msisdn, purpose: "LOGIN", role: "RESTAURANT" }),
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

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      let verifyRes: Response;
      try {
        verifyRes = await fetch(`${API_BASE}/api/auth/otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: normalizeLoginPhone(phone), code: code.trim(), role: "RESTAURANT" }),
        });
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
      const createdNow = verifyRes.status === 201 || (data as { isNew?: boolean }).isNew === true;
      if (!isRestaurantRole(typeof role === "string" ? role : null)) {
        if (createdNow || role === "PASSENGER") {
          throw new Error(
            "Aucun compte partenaire restaurant pour ce numéro. Créez-le d'abord dans l'admin SENGA (rôle Restaurant), puis liez le restaurant — pas d'inscription automatique.",
          );
        }
        throw new Error(`Ce compte n'est pas un partenaire restaurant (rôle: ${String(role ?? "?")}).`);
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-orange-50 to-violet-50">
      <PwaInstallBanner accentClass="bg-[#FF6B35]" />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="text-3xl mb-2">🍽️</div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">SENGA Restaurant</h1>
          <p className="text-sm text-gray-500 mt-1">Portail partenaire livraison repas</p>
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
            disabled={codeSent}
          />
        </label>
        {codeSent && (
          <label className="block text-sm">
            <span className="text-gray-600">
              {isSeedDemoPhone(phone)
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
          disabled={loading || !phone.trim() || (codeSent && !code.trim())}
          onClick={codeSent ? verifyOtp : requestOtp}
          className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
        >
          {loading ? (codeSent ? "Connexion…" : "Envoi…") : codeSent ? "Se connecter" : "Recevoir le code"}
        </button>
        {codeSent && (
          <button
            type="button"
            className="w-full text-sm text-gray-500 underline"
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setError(null);
            }}
          >
            Changer de numéro
          </button>
        )}
        {error && <p className="text-sm text-red-600 text-center break-all">{error}</p>}
        <p className="text-xs text-gray-400 text-center">
          {isSeedDemoPhone(phone)
            ? <>Numéro de démo : code <code>123456</code>, pas de SMS.</>
            : "Numéro réel +243 : le code arrive par SMS."}{" "}
          Le compte restaurant doit exister dans l&apos;admin SENGA.
        </p>
        <p className="text-[10px] text-gray-300 text-center break-all">API: {API_BASE}</p>
      </div>
    </div>
  );
}
