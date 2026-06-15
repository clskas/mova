"use client";

import { useEffect, useState } from "react";
import { apiFetch, checkGatewayHealth } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/auth";

type Props = { children: React.ReactNode };

export function OtpGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [mock, setMock] = useState(false);
  const [phone, setPhone] = useState("+243812345678");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkGatewayHealth().then((ok) => {
      setMock(!ok);
      setAuthenticated(Boolean(getToken()) || !ok);
      setReady(true);
    });
  }, []);

  async function requestOtp() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone }),
      }, { useMock: mock });
      setCodeSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'envoyer le code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ accessToken?: string }>("/api/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      }, { useMock: mock });
      if (data.accessToken) {
        setToken(data.accessToken, phone);
        setAuthenticated(true);
      } else {
        setError("Réponse invalide du serveur");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Code OTP invalide");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-sm mx-auto min-h-screen flex flex-col justify-center p-6">
        <h1 className="text-xl font-bold text-center mb-2">MOVA — Connexion</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Entrez votre numéro +243 pour continuer
        </p>
        {mock && (
          <p className="text-sm text-[#FF6B35] bg-orange-50 rounded-lg py-2 px-3 mb-4 text-center">
            Mode démo — passerelle indisponible (OTP : 123456)
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3 mb-4">{error}</p>
        )}
        <input
          className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3"
          placeholder="+243812345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={codeSent}
        />
        {codeSent && (
          <input
            className="w-full rounded-xl border-0 bg-white p-3 shadow-sm mb-3"
            placeholder="Code à 6 chiffres"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
          />
        )}
        <button
          type="button"
          onClick={codeSent ? verifyOtp : requestOtp}
          disabled={loading}
          className="w-full bg-[#6C63FF] text-white rounded-xl py-3 font-semibold disabled:opacity-50"
        >
          {loading ? "Chargement…" : codeSent ? "Se connecter" : "Recevoir le code"}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export function useLogout() {
  return () => {
    clearToken();
    window.location.reload();
  };
}
