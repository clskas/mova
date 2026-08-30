"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decodeJwtPayload, isRestaurantRole, isSeedDemoPhone, normalizeLoginPhone, setToken } from "@/lib/auth";
import { GoogleContinueButton, googleClientId } from "@/components/GoogleContinueButton";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  LOGIN_GENERIC,
  LOGIN_GOOGLE_UNAVAILABLE,
  LOGIN_OTP_UNAVAILABLE,
  toUserErrorMessage,
} from "@/lib/user-messages";

const API_BASE = PUBLIC_API_BASE;
const RESTAURANT_PHONE = process.env.NEXT_PUBLIC_RESTAURANT_PHONE ?? "+243900000030";

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
            role: "RESTAURANT",
            intendedRole: "RESTAURANT",
            portal: "restaurant",
          }),
        });
      } catch {
        throw new Error(LOGIN_OTP_UNAVAILABLE);
      }
      lastStatus = requestRes.status;
      const seed = isSeedDemoPhone(phone);
      if (!requestRes.ok) {
        const msg = await readErrorMessage(requestRes, LOGIN_OTP_UNAVAILABLE);
        if (!(seed && (requestRes.status === 429 || requestRes.status >= 500))) {
          throw new Error(msg);
        }
      }
      setCode(seed ? "123456" : "");
      setCodeSent(true);
    } catch (e) {
      setError(toUserErrorMessage(e, lastStatus >= 500 ? LOGIN_OTP_UNAVAILABLE : "Impossible d'envoyer le code. Réessayez."));
    } finally {
      setLoading(false);
    }
  }

  function finishRestaurantSession(data: { accessToken?: string; user?: { role?: string } }) {
    if (!data.accessToken) {
      throw new Error(LOGIN_GOOGLE_UNAVAILABLE);
    }
    const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
    if (!isRestaurantRole(typeof role === "string" ? role : null)) {
      throw new Error("Ce compte n'est pas un partenaire restaurant.");
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
          role: "RESTAURANT",
          intendedRole: "RESTAURANT",
          portal: "restaurant",
        }),
      });
      const data = await verifyRes.json().catch(() => ({}));
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
      finishRestaurantSession(data);
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
                ? {
                    challengeId: googleChallenge.id,
                    code: code.trim(),
                    role: "RESTAURANT",
                    intendedRole: "RESTAURANT",
                    portal: "restaurant",
                  }
                : {
                    phone: normalizeLoginPhone(phone),
                    code: code.trim(),
                    role: "RESTAURANT",
                    intendedRole: "RESTAURANT",
                    portal: "restaurant",
                  },
            ),
          },
        );
      } catch {
        throw new Error(LOGIN_GENERIC);
      }
      lastStatus = verifyRes.status;

      let data: { accessToken?: string; user?: { role?: string }; error?: { message?: string } } = {};
      try {
        data = await verifyRes.json();
      } catch {
        throw new Error(LOGIN_GENERIC);
      }
      if (!verifyRes.ok || !data.accessToken) {
        throw new Error(data.error?.message ?? LOGIN_GENERIC);
      }
      const role = data.user?.role ?? decodeJwtPayload(data.accessToken)?.role;
      if (!isRestaurantRole(typeof role === "string" ? role : null)) {
        throw new Error("Ce compte n'est pas un partenaire restaurant.");
      }
      setToken(data.accessToken);
      router.replace("/");
    } catch (e) {
      setError(toUserErrorMessage(e, lastStatus >= 500 ? LOGIN_GENERIC : "Connexion impossible. Réessayez."));
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
          className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
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
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <p className="text-xs text-gray-400 text-center">
          {isSeedDemoPhone(phone)
            ? <>Numéro de démo : code <code>123456</code>, pas de SMS.</>
            : "Numéro réel +243 : le code arrive par SMS."}{" "}
          Première connexion (téléphone ou Google) : un compte restaurant est créé automatiquement. Un seul portefeuille.
        </p>
      </div>
    </div>
  );
}
