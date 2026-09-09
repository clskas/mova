"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  WORK_ACTIVATION_PIN_HEADING_FR,
  WORK_ACTIVATION_PIN_HINT_FR,
  ActivationPinCard,
  accountPhone,
  isPartnerPinExemptPath,
  partnerNeedsWorkActivationPin,
} from "@/components/PinAuth";
import { RestaurantOnboardingCard } from "@/components/RestaurantOnboardingCard";
import { apiFetch, fetchKyc, fetchProfile } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  RESTAURANT_AUTH_INTENT,
  dropTokenKeepPhone,
  getLastPhone,
  getToken,
  isPinPending,
  isPinSessionUnlocked,
  isRestaurantRole,
  normalizeLoginPhone,
  phoneFromToken,
  roleFromToken,
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
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [activateIdentity, setActivateIdentity] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token || !isRestaurantRole(roleFromToken())) {
      router.replace("/login");
      return;
    }
    if (isPinPending() || !isPinSessionUnlocked()) {
      dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
      router.replace("/login?pin=1");
      return;
    }
    let cancelled = false;

    async function check() {
      try {
        const [me, profile, kyc] = await Promise.all([
          apiFetch<Me>("/api/users/me"),
          fetchProfile().catch(() => null),
          fetchKyc().catch(() => null),
        ]);
        if (cancelled) return;
        if (me.needsPinSetup && me.pinConfigured !== true) {
          dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
          router.replace("/login");
          return;
        }
        setNeedsProfileSetup(profile?.needsProfileSetup === true);
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
        const needsPin = partnerNeedsWorkActivationPin({
          kycStatus: kyc?.kycStatus,
          activationPinVerified: kyc?.activationPinVerified === true,
          identity: fallback,
        });
        setActivateIdentity(fallback);
        setNeedsActivation(needsPin);
        setReady(true);
      } catch {
        dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
        router.replace("/login?pin=1");
      }
    }

    void check();
    const poll = window.setInterval(() => {
      if (!cancelled) void check();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }

  const showOnboarding = needsProfileSetup && !isPartnerPinExemptPath(pathname);
  const showActivation = needsActivation && !needsProfileSetup && !isPartnerPinExemptPath(pathname);

  return (
    <>
      {/* Keep portal children (live WS + sound) mounted under overlays so new orders still alert. */}
      {children}
      {showOnboarding && (
        <div className="fixed inset-0 z-[10040] bg-gradient-to-br from-orange-50 to-violet-50 overflow-y-auto">
          <div className="min-h-[100dvh] flex items-start justify-center p-6 pt-10 pb-16">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">
              <p className="text-center text-sm text-gray-500 mb-4">SENGA Restaurant</p>
              <RestaurantOnboardingCard
                onComplete={() => {
                  setNeedsProfileSetup(false);
                  setReady(true);
                  router.replace("/dossier");
                }}
              />
            </div>
          </div>
        </div>
      )}
      {showActivation && (
        <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-orange-50 to-violet-50 overflow-y-auto">
          <div className="min-h-[100dvh] flex items-start justify-center p-6 pt-10 pb-16">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">
              <p className="text-center text-sm text-gray-500 mb-4">SENGA Restaurant</p>
              <ActivationPinCard
                apiBase={PUBLIC_API_BASE}
                intent={RESTAURANT_AUTH_INTENT}
                accentClass="bg-[#FF6B35]"
                highlightClass="border-orange-400 bg-orange-50"
                heading={WORK_ACTIVATION_PIN_HEADING_FR}
                hint={WORK_ACTIVATION_PIN_HINT_FR}
                lockIdentity
                defaultIdentity={activateIdentity}
                normalizeIdentity={normalizeLoginPhone}
                verifyPath="/api/restaurant/kyc/activation-pin"
                authToken={getToken()}
                onActivated={() => {
                  setNeedsActivation(false);
                  setReady(true);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
