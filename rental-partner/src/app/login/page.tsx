"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decodeJwtPayload, isRentalPartnerRole, setToken } from "@/lib/auth";
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
  const [code, setCode] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setError(null);
    let lastStatus = 0;
    try {
      let requestRes: Response;
      try {
        requestRes = await fetch(`${API_BASE}/api/auth/otp/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, purpose: "LOGIN" }),
        });
      } catch {
        throw new Error(
          `Impossible de joindre l'API SENGA (${API_BASE}). Vérifiez la connexion ou attendez le démarrage du serveur.`,
        );
      }
      lastStatus = requestRes.status;
      if (!requestRes.ok) {
        const msg = await readErrorMessage(requestRes, `Demande OTP refusée (${requestRes.status})`);
        throw new Error(msg);
      }

      let verifyRes: Response;
      try {
        verifyRes = await fetch(`${API_BASE}/api/auth/otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code }),
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
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Code OTP (dev: 123456)</span>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 p-3"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={login}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
        >
          {loading ? "Connexion…" : "Accéder au portail"}
        </button>
        {error && <p className="text-sm text-red-600 text-center break-all">{error}</p>}
        <p className="text-xs text-gray-400 text-center">
          Dev : compte <code>{PARTNER_PHONE}</code> — rôle RENTAL_PARTNER créé par l&apos;admin SENGA
        </p>
        <p className="text-[10px] text-gray-300 text-center break-all">API: {API_BASE}</p>
      </div>
    </div>
  );
}
