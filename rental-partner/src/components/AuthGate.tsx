"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { shouldRequirePinSetup } from "@/components/PinAuth";
import { apiFetch } from "@/lib/api";
import { getLastPhone, getToken, isPinPending, isRentalPartnerRole, phoneFromToken, roleFromToken, setPinPending } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token || !isRentalPartnerRole(roleFromToken()) || isPinPending()) {
      router.replace("/login");
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
        if (shouldRequirePinSetup({ pinConfigured: me.pinConfigured, user: me }, fallback)) {
          setPinPending(true);
          router.replace("/login");
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

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }

  return <>{children}</>;
}
