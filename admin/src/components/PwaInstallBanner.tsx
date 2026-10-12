"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

const DISMISS_KEY = "mova-pwa-install-dismissed";

export function PwaInstallBanner({
  accentClass = "bg-[#5b54e6]",
  appName = "SENGA Admin",
}: {
  accentClass?: string;
  appName?: string;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) {
      setHidden(true);
      return;
    }

    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") {
        setHidden(true);
        return;
      }
    } catch {
      /* Safari private mode */
    }

    const onIos = isIos();
    setIos(onIos);
    setReady(true);

    if (onIos) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      dismiss();
      return;
    }
    setShowHowTo(true);
  }

  if (!ready || hidden || isStandalone()) return null;

  const howTo = ios
    ? "Sur iPhone : touchez Partager (carré avec flèche), puis « Sur l'écran d'accueil »."
    : deferred
      ? "Accès rapide depuis l'écran d'accueil."
      : "Sur Chrome : menu ⋮ → « Installer l'application ».";

  return (
    <div
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-3 right-3 z-[10000] mx-auto max-w-lg rounded-2xl border-2 border-[#5b54e6]/40 bg-white px-4 py-3 shadow-[0_12px_40px_rgba(26,26,46,0.28)]"
      role="dialog"
      aria-label={`Installer ${appName}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentClass} text-lg font-bold text-white`}>
          ↓
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[#1A1A2E]">Installer {appName}</p>
          <p className="mt-1 text-sm leading-snug text-gray-600">{howTo}</p>
          {showHowTo && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              {ios
                ? "Safari : Partager → « Sur l'écran d'accueil »."
                : "Chrome ⋮ → « Installer l'application »."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void install()}
              className={`min-h-11 min-w-[7.5rem] rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md ${accentClass}`}
            >
              {deferred ? "Installer" : ios ? "Comment installer" : "Installer"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
