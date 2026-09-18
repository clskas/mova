"use client";

import { useEffect, useState } from "react";

type Props = {
  appId: "resto" | "location" | "senga";
  apiBase: string;
  children: React.ReactNode;
  accentClass?: string;
};

const DEFAULT_MSG =
  "SENGA est actuellement en maintenance afin d’améliorer nos services et vous offrir une expérience encore meilleure. Merci pour votre patience et votre confiance — nous serons de retour très bientôt !";

export function MaintenanceGate({ appId, apiBase, children, accentClass = "text-orange-700" }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = apiBase.replace(/\/+$/, "").replace(/\/api$/i, "");
    const load = async () => {
      try {
        const res = await fetch(`${base}/api/public/client-config`, {
          cache: "no-store",
          headers: { "X-Senga-Client": appId },
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          maintenance?: { messageFr?: string; apps?: Record<string, boolean> };
        };
        if (cancelled) return;
        if (body.maintenance?.apps?.[appId] === true) {
          setMessage(body.maintenance.messageFr?.trim() || DEFAULT_MSG);
        } else {
          setMessage(null);
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [appId, apiBase]);

  if (message) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4 py-8 bg-[#F5F5F7]">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 space-y-4 text-center">
          <p className={`text-xs font-semibold uppercase tracking-wide ${accentClass}`}>Maintenance</p>
          <h1 className="text-xl font-bold text-[#1A1A2E]">SENGA</h1>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
