"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PinSetupForm, accountPhone, shouldRequirePinSetup } from "@/components/PinAuth";
import { apiFetch } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  dropTokenKeepPhone,
  getLastPhone,
  getToken,
  isPinPending,
  isPinSessionUnlocked,
  isRentalPartnerRole,
  isSeedDemoPhone,
  markPinSessionUnlocked,
  phoneFromToken,
  roleFromToken,
  setPinPending,
} from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token || !isRentalPartnerRole(roleFromToken())) {
      router.replace("/login");
      return;
    }
    if (isPinPending()) {
      setSetupToken(token);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetch<{ pinConfigured?: boolean; needsPinSetup?: boolean; phone?: string; hasPhone?: boolean }>(
          "/api/users/me",
        );
        if (cancelled) return;
        const fallback = accountPhone(
          { pinConfigured: me.pinConfigured, phone: me.phone, hasPhone: me.hasPhone, user: me },
          phoneFromToken() || getLastPhone() || "",
        );
        if (
          shouldRequirePinSetup(
            { pinConfigured: me.pinConfigured, needsPinSetup: me.needsPinSetup, phone: me.phone, hasPhone: me.hasPhone, user: me },
            fallback,
            token,
          )
        ) {
          setPinPending(true);
          setSetupToken(token);
          return;
        }
        if (me.pinConfigured && fallback && !isSeedDemoPhone(fallback) && !isPinSessionUnlocked()) {
          dropTokenKeepPhone(fallback);
          router.replace("/login");
          return;
        }
      } catch {
        dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
        router.replace("/login");
        return;
      }
      if (!cancelled) {
        markPinSessionUnlocked();
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (setupToken) {
    return (
      <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-indigo-50 to-violet-50 overflow-y-auto">
        <div className="min-h-[100dvh] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
            <PinSetupForm
              apiBase={PUBLIC_API_BASE}
              token={setupToken}
              accentClass="bg-indigo-600"
              onDone={() => {
                setPinPending(false);
                markPinSessionUnlocked();
                setSetupToken(null);
                setReady(true);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }

  return <>{children}</>;
}
