"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decodeJwtPayload, isRestaurantRole, setToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const RESTAURANT_PHONE = process.env.NEXT_PUBLIC_RESTAURANT_PHONE ?? "+243900000030";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState(RESTAURANT_PHONE);
  const [code, setCode] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
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
      const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
      if (!isRestaurantRole(typeof role === "string" ? role : null)) {
        throw new Error("Ce compte n'est pas un partenaire restaurant. Contactez MOVA.");
      }
      setToken(data.accessToken);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-orange-50 to-violet-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="text-3xl mb-2">🍽️</div>
          <h1 className="text-2xl font-semibold text-[#1A1A2E]">MOVA Restaurant</h1>
          <p className="text-sm text-gray-500 mt-1">Portail partenaire livraison repas</p>
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
          className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
        >
          {loading ? "Connexion…" : "Accéder au portail"}
        </button>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <p className="text-xs text-gray-400 text-center">
          Dev : compte <code>{RESTAURANT_PHONE}</code> lié à un restaurant dans l&apos;admin MOVA
        </p>
      </div>
    </div>
  );
}
