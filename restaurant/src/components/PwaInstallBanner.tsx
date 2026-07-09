"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferred || hidden) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setHidden(true);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border border-gray-200 bg-white shadow-lg p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <p className="font-medium text-[#1A1A2E]">Installer l&apos;application</p>
        <p className="text-gray-500 text-xs mt-0.5">Accès rapide depuis l&apos;écran d&apos;accueil</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setHidden(true)} className="px-3 py-1.5 text-sm text-gray-500">
          Plus tard
        </button>
        <button type="button" onClick={install} className="px-4 py-1.5 rounded-lg bg-orange-600 text-white text-sm font-medium">
          Installer
        </button>
      </div>
    </div>
  );
}
