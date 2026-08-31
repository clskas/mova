"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PinSetupForm, shouldRequirePinSetup } from "@/components/PinAuth";
import { fetchCurrentUser } from "@/lib/api";
import { getLastPhone, getToken, isPinPending, phoneFromToken, setPinPending } from "@/lib/auth";

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
        const fallback = (me.phone ?? phoneFromToken() ?? getLastPhone() ?? "").trim();
        if (
          shouldRequirePinSetup(
            { pinConfigured: me.pinConfigured, phone: me.phone, hasPhone: me.hasPhone, user: me },
            fallback,
          )
        ) {
          setPinPending(true);
          setSetupToken(token);
          return;
        }
      } catch {
        /* keep going if /me is unreachable — token is still present */
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (setupToken) {
    return (
      <div className="fixed inset-0 z-[80] bg-[var(--background)] overflow-y-auto">
        <div className="min-h-[100dvh] flex items-center justify-center p-6">
          <div className="w-full max-w-md mova-card p-8 shadow-mova">
            <PinSetupForm
              apiBase={API_BASE}
              token={setupToken}
              onDone={() => {
                setPinPending(false);
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
