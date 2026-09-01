"use client";

import { useEffect, useState } from "react";

const LOCAL_BUILD = (process.env.NEXT_PUBLIC_BUILD_ID ?? "dev").trim();
const DISMISS_KEY = "mova-update-dismissed-build";
const POLL_MS = 30_000;

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

export function UpdateBanner({ accentClass = "bg-orange-600" }: { accentClass?: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function show() {
      if (!cancelled) setAvailable(true);
    }

    async function check() {
      const remote = await readRemoteBuildId();
      if (!remote || remote === LOCAL_BUILD) return;
      if (sessionStorage.getItem(DISMISS_KEY) === remote) return;
      const autoKey = `mova-auto-reloaded-${remote}`;
      try {
        if (sessionStorage.getItem(autoKey) !== "1") {
          sessionStorage.setItem(autoKey, "1");
          await reloadWithServiceWorker();
          return;
        }
      } catch {
        /* Safari private mode */
      }
      show();
    }

    const onSw = () => {
      const dismissed = sessionStorage.getItem(DISMISS_KEY);
      if (dismissed && dismissed === LOCAL_BUILD) return;
      show();
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onPageShow = () => void check();
    const onFocus = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("mova:update-available", onSw);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("mova:update-available", onSw);
    };
  }, []);

  if (!available) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[9999] border-b-2 border-amber-400 bg-amber-400 px-3 py-2.5 flex items-center justify-between gap-2 pt-[max(0.6rem,env(safe-area-inset-top))] shadow-lg"
    >
      <p className="text-sm font-semibold text-amber-950 min-w-0">
        Nouvelle version disponible
      </p>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          className="px-2.5 py-1.5 min-h-10 text-sm text-amber-950 underline"
          onClick={() => {
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
          className={`px-3 py-1.5 min-h-10 rounded-lg ${accentClass} text-white text-sm font-semibold`}
          onClick={() => void reloadWithServiceWorker()}
        >
          Actualiser
        </button>
      </div>
    </div>
  );
}
