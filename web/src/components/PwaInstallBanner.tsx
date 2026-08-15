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

export function PwaInstallBanner({ accentClass = "bg-[#6C63FF]" }: { accentClass?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    try {
      if (sessionStorage.getItem("mova-pwa-install-dismissed") === "1") {
        setHidden(true);
        return;
      }
    } catch {
      /* Safari private mode */
    }

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

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
      sessionStorage.setItem("mova-pwa-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (hidden || isStandalone()) return null;
  if (!deferred && !showIosHint) return null;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 z-50 mx-auto max-w-lg rounded-xl border border-gray-200 bg-white shadow-lg px-3 py-2 sm:p-4 flex items-center justify-between gap-2">
      <div className="text-xs sm:text-sm pr-2 min-w-0">
        <p className="font-medium text-[#1A1A2E]">Installer SENGA</p>
        {showIosHint ? (
          <p className="text-gray-500 text-xs mt-0.5">
            Sur iPhone : touchez <span className="font-medium">Partager</span> puis{" "}
            <span className="font-medium">Sur l&apos;écran d&apos;accueil</span>.
          </p>
        ) : (
          <p className="text-gray-500 text-xs mt-0.5">Accès rapide depuis l&apos;écran d&apos;accueil (Android / Chrome).</p>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={dismiss} className="px-3 py-1.5 text-sm text-gray-500">
          Plus tard
        </button>
        {deferred && (
          <button
            type="button"
            onClick={() => void install()}
            className={`px-4 py-1.5 rounded-lg ${accentClass} text-white text-sm font-medium`}
          >
            Installer
          </button>
        )}
      </div>
    </div>
  );
}
