"use client";

import { useEffect, useState } from "react";

const LOCAL_BUILD = (process.env.NEXT_PUBLIC_BUILD_ID ?? "dev").trim();
const DISMISS_KEY = "mova-update-dismissed-build";
const POLL_MS = 60_000;

async function readRemoteBuildId(): Promise<string | null> {
  const urls = [`/version.json?t=${Date.now()}`, `/api/version?t=${Date.now()}`];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store", headers: { Pragma: "no-cache" } });
      if (!res.ok) continue;
      const data = (await res.json()) as { buildId?: string };
      const remote = data.buildId?.trim();
      if (remote) return remote;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function reloadWithServiceWorker() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export function UpdateBanner({ accentClass = "bg-[#6C63FF]" }: { accentClass?: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const remote = await readRemoteBuildId();
      if (!remote || remote === LOCAL_BUILD) return;
      if (sessionStorage.getItem(DISMISS_KEY) === remote) return;
      if (!cancelled) setAvailable(true);
    }

    const onSw = () => {
      const dismissed = sessionStorage.getItem(DISMISS_KEY);
      if (dismissed && dismissed === LOCAL_BUILD) return;
      setAvailable(true);
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onPageShow = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("mova:update-available", onSw);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("mova:update-available", onSw);
    };
  }, []);

  if (!available) return null;

  return (
    <>
    <div className="h-12 sm:h-14 shrink-0" aria-hidden />
    <div className="fixed top-0 inset-x-0 z-[300] border-b border-amber-200 bg-amber-50 px-3 py-2 sm:py-2.5 flex items-center justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-md">
      <p className="text-xs sm:text-sm text-amber-950 min-w-0 sm:whitespace-normal">
        <span className="sm:hidden">Une nouvelle version est disponible</span>
        <span className="hidden sm:inline">Une nouvelle version est disponible. Rechargez pour bénéficier des dernières améliorations.</span>
      </p>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          className="px-2.5 py-1.5 min-h-9 sm:min-h-11 text-xs sm:text-sm text-amber-800"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "pending");
            void readRemoteBuildId().then((remote) => {
              sessionStorage.setItem(DISMISS_KEY, remote || LOCAL_BUILD);
            });
            setAvailable(false);
          }}
        >
          Plus tard
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 sm:px-4 sm:py-2 min-h-9 sm:min-h-11 rounded-lg ${accentClass} text-white text-xs sm:text-sm font-medium`}
          onClick={() => void reloadWithServiceWorker()}
        >
          Actualiser
        </button>
      </div>
    </div>
    </>
  );
}
