"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActivationPinCard,
  PinSetupForm,
  accountPhone,
  shouldRequirePinSetup,
  type AuthPayload,
} from "@/components/PinAuth";
import { apiFetch } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  RESTAURANT_AUTH_INTENT,
  dropTokenKeepPhone,
  getLastPhone,
  getToken,
  isPinPending,
  isPinSessionUnlocked,
  isRestaurantRole,
  isSeedDemoPhone,
  markPinSessionUnlocked,
  normalizeLoginPhone,
  phoneFromToken,
  roleFromToken,
  setPinPending,
  setToken,
} from "@/lib/auth";

type Me = {
  pinConfigured?: boolean;
  needsPinSetup?: boolean;
  phone?: string;
  email?: string;
  hasPhone?: boolean;
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [activateIdentity, setActivateIdentity] = useState("");

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
        const me = await apiFetch<Me>("/api/users/me");
        if (cancelled) return;
        const fallback = accountPhone(
          {
            pinConfigured: me.pinConfigured,
            phone: me.phone,
            email: me.email,
            hasPhone: me.hasPhone,
            user: me,
          },
          phoneFromToken() || getLastPhone() || "",
        );
        if (
          shouldRequirePinSetup(
            {
              pinConfigured: me.pinConfigured,
              needsPinSetup: me.needsPinSetup,
              phone: me.phone,
              hasPhone: me.hasPhone,
              user: me,
            },
            fallback,
            token,
          )
        ) {
          setPinPending(true);
          setSetupToken(token);
          return;
        }
        if (me.pinConfigured && !isSeedDemoPhone(fallback) && !isPinSessionUnlocked()) {
          setActivateIdentity(fallback);
          setNeedsActivation(true);
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
      <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-orange-50 to-violet-50 overflow-y-auto">
        <div className="min-h-[100dvh] flex items-start justify-center p-6 pt-10">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
            <PinSetupForm
              apiBase={PUBLIC_API_BASE}
              token={setupToken}
              accentClass="bg-[#FF6B35]"
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

  if (needsActivation) {
    return (
      <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-orange-50 to-violet-50 overflow-y-auto">
        <div className="min-h-[100dvh] flex items-start justify-center p-6 pt-10">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            <p className="text-center text-sm text-gray-500 mb-4">SENGA Restaurant</p>
            <ActivationPinCard
              apiBase={PUBLIC_API_BASE}
              intent={{ ...RESTAURANT_AUTH_INTENT }}
              accentClass="bg-[#FF6B35]"
              highlightClass="border-orange-400 bg-orange-50"
              defaultIdentity={activateIdentity}
              normalizeIdentity={normalizeLoginPhone}
              onActivated={(data: AuthPayload) => {
                const phone = accountPhone(data, activateIdentity);
                if (data.accessToken) setToken(data.accessToken, phone || undefined);
                markPinSessionUnlocked();
                setNeedsActivation(false);
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
