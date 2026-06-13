"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const ADMIN_PHONE = process.env.NEXT_PUBLIC_ADMIN_PHONE ?? "+243900000001";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"otp" | "token">("otp");
  const [phone, setPhone] = useState(ADMIN_PHONE);
  const [code, setCode] = useState("123456");
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
        throw new Error(data.error?.message ?? "Connexion refusée");
      }
      if (data.user?.role !== "ADMIN") {
        throw new Error("Ce compte n'a pas le rôle ADMIN. Exécutez scripts/seed-admin.ps1");
      }
      setToken(data.accessToken);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
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
    setToken(trimmed);
    router.replace("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">MOVA Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Connexion sécurisée</p>
        </div>

        <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setMode("otp")}
            className={`flex-1 py-2 rounded-lg text-sm ${mode === "otp" ? "bg-white shadow font-medium" : "text-gray-500"}`}
          >
            OTP téléphone
          </button>
          <button
            type="button"
            onClick={() => setMode("token")}
            className={`flex-1 py-2 rounded-lg text-sm ${mode === "token" ? "bg-white shadow font-medium" : "text-gray-500"}`}
          >
            JWT dev
          </button>
        </div>

        {mode === "otp" ? (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="text-gray-600">Téléphone admin</span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200 p-3"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+243900000001"
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
              onClick={loginWithOtp}
              className="w-full py-3 rounded-xl bg-[#6C63FF] text-white font-medium disabled:opacity-60"
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="text-gray-600">JWT (Bearer token)</span>
              <textarea
                className="mt-1 w-full rounded-xl border border-gray-200 p-3 font-mono text-xs h-28"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
              />
            </label>
            <button
              type="button"
              onClick={loginWithToken}
              className="w-full py-3 rounded-xl bg-[#6C63FF] text-white font-medium"
            >
              Utiliser ce token
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <p className="text-xs text-gray-400 text-center">
          Dev: <code>scripts/seed-admin.ps1</code> puis OTP <code>{ADMIN_PHONE}</code> / <code>123456</code>
        </p>
      </div>
    </div>
  );
}
