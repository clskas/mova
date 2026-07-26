"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decodeJwtPayload, setToken } from "@/lib/auth";
import { sanitizeAdminError } from "@/lib/api";
import { defaultPathForRole, isAdminRole, normalizeAdminRole } from "@/lib/rbac";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const isProd = process.env.NODE_ENV === "production";
const ADMIN_PHONE = process.env.NEXT_PUBLIC_ADMIN_PHONE ?? (isProd ? "" : "+243900000001");

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"otp" | "token">("otp");
  const [phone, setPhone] = useState(ADMIN_PHONE);
  const [code, setCode] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginWithOtp() {
    setLoading(true);
    setError(null);
    try {
      await fetch(`${API_BASE}/api/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const verifyRes = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.accessToken) {
        throw new Error(
          sanitizeAdminError(data.error?.message ?? "Connexion refusée", verifyRes.status),
        );
      }
      const role = normalizeAdminRole(data.user?.role);
      if (!role) {
        throw new Error("Ce compte n'a pas un rôle staff autorisé.");
      }
      setToken(data.accessToken);
      router.replace(defaultPathForRole(role));
    } catch (e) {
      setError(sanitizeAdminError(e instanceof Error ? e.message : "Erreur de connexion"));
    } finally {
      setLoading(false);
    }
  }

  function loginWithToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setError("Collez un JWT valide");
      return;
    }
    const payload = decodeJwtPayload(trimmed);
    if (!isAdminRole(typeof payload?.role === "string" ? payload.role : null)) {
      setError("JWT sans rôle staff autorisé");
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

          {mode === "otp" ? (
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Téléphone admin</span>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-mova-midnight outline-none transition focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+243900000001"
                  autoComplete="tel"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Code OTP</span>
                <span className="ml-2 text-xs text-gray-400">dev : 123456</span>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-mova-midnight outline-none transition focus:border-mova-violet focus:ring-2 focus:ring-mova-violet/20"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              <button type="button" disabled={loading} onClick={loginWithOtp} className="mova-btn-primary w-full">
                {loading ? "Connexion…" : "Se connecter"}
              </button>
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
            Environnement dev : exécutez <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">npm run seed:admin-demo</code>
            <br />
            puis OTP <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{ADMIN_PHONE}</code> /{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">123456</code>
          </p>
        </div>
      </main>
    </div>
  );
}
