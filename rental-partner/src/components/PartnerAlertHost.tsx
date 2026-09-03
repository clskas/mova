"use client";

import { useEffect, useState } from "react";
import {
  dismissPartnerToast,
  getPartnerAlertUi,
  subscribePartnerAlertUi,
  unlockPartnerAlerts,
  type PartnerAlertUi,
} from "@/lib/partner-alerts";

export function PartnerAlertHost() {
  const [ui, setUi] = useState<PartnerAlertUi>(() =>
    typeof window === "undefined" ? { soundEnabled: false, toast: null } : getPartnerAlertUi(),
  );

  useEffect(() => subscribePartnerAlertUi(setUi), []);

  return (
    <>
      {!ui.soundEnabled && (
        <div className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-3 right-3 z-[60] mx-auto max-w-lg rounded-xl border border-indigo-200 bg-indigo-50 shadow-lg px-3 py-2.5 flex items-center justify-between gap-2">
          <p className="text-sm text-indigo-950 min-w-0">
            Activez le son pour entendre les <span className="font-semibold">nouvelles demandes de location</span>.
          </p>
          <button
            type="button"
            onClick={() => void unlockPartnerAlerts()}
            className="shrink-0 px-3 py-2 min-h-11 rounded-lg bg-indigo-600 text-white text-sm font-medium"
          >
            Activer le son
          </button>
        </div>
      )}
      {ui.toast && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 z-[70] mx-auto max-w-lg rounded-xl border border-indigo-300 bg-white shadow-xl px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-[#1A1A2E]">{ui.toast.title}</p>
            <p className="text-sm text-gray-600 mt-0.5">{ui.toast.body}</p>
          </div>
          <button
            type="button"
            onClick={dismissPartnerToast}
            className="shrink-0 px-3 py-2 min-h-11 rounded-lg bg-indigo-600 text-white text-sm font-medium"
          >
            J&apos;ai vu
          </button>
        </div>
      )}
    </>
  );
}
