"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { shouldRequirePinSetup } from "@/components/PinAuth";
import { fetchCurrentUser } from "@/lib/api";
import { getToken, isPinPending, setPinPending } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token || isPinPending()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchCurrentUser();
        if (cancelled) return;
        if (shouldRequirePinSetup({ pinConfigured: me.pinConfigured, user: me })) {
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
