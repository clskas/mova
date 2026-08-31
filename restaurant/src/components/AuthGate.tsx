"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PinSetupForm, shouldRequirePinSetup } from "@/components/PinAuth";
import { apiFetch } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import { getLastPhone, getToken, isPinPending, isRestaurantRole, phoneFromToken, roleFromToken, setPinPending } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token || !isRestaurantRole(roleFromToken())) {
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
        const me = await apiFetch<{ pinConfigured?: boolean; phone?: string; hasPhone?: boolean }>(
          "/api/users/me",
        );
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
      <div className="fixed inset-0 z-[80] bg-gradient-to-br from-orange-50 to-violet-50 overflow-y-auto">
        <div className="min-h-[100dvh] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
            <PinSetupForm
              apiBase={PUBLIC_API_BASE}
              token={setupToken}
              accentClass="bg-[#FF6B35]"
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
