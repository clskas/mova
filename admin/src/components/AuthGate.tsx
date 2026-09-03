"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PinSetupForm, accountPhone, shouldRequirePinSetup } from "@/components/PinAuth";
import { fetchCurrentUser } from "@/lib/api";
import {
  dropTokenKeepPhone,
  getLastPhone,
  getToken,
  isPinPending,
  isPinSessionUnlocked,
  isSeedDemoPhone,
  markPinSessionUnlocked,
  phoneFromToken,
  setPinPending,
} from "@/lib/auth";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
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
        const me = await fetchCurrentUser();
        if (cancelled) return;
        const fallback = accountPhone(
          { pinConfigured: me.pinConfigured, user: me, phone: me.phone, hasPhone: me.hasPhone },
          (phoneFromToken() || getLastPhone() || "").trim(),
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
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (setupToken) {
    return (
      <div className="fixed inset-0 z-[10050] bg-[var(--background)] overflow-y-auto">
        <div className="min-h-[100dvh] flex items-center justify-center p-6">
          <div className="w-full max-w-md mova-card p-8 shadow-mova">
            <PinSetupForm
              apiBase={API_BASE}
              token={setupToken}
              onDone={() => {
                setPinPending(false);
                setSetupToken(null);
                markPinSessionUnlocked();
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
