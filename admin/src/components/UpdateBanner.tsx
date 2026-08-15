"use client";

import { useEffect, useState } from "react";

const LOCAL_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const DISMISS_KEY = "mova-update-dismissed-build";

export function UpdateBanner({ accentClass = "bg-[#6C63FF]" }: { accentClass?: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        const remote = data.buildId?.trim();
        if (!remote || remote === LOCAL_BUILD) return;
        if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
        if (!cancelled) setAvailable(true);
      } catch {
        /* ignore */
      }
    }

    const onSw = () => {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
      setAvailable(true);
    };

    void check();
    const timer = window.setInterval(() => void check(), 120_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("mova:update-available", onSw);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("mova:update-available", onSw);
    };
  }, []);

  if (!available) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-amber-950">
        Une nouvelle version est disponible. Rechargez pour bénéficier des dernières améliorations.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="px-3 py-2 min-h-11 text-sm text-amber-800"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setAvailable(false);
          }}
        >
          Plus tard
        </button>
        <button
          type="button"
          className={`px-4 py-2 min-h-11 rounded-lg ${accentClass} text-white text-sm font-medium`}
          onClick={() => window.location.reload()}
        >
          Actualiser
        </button>
      </div>
    </div>
  );
}
