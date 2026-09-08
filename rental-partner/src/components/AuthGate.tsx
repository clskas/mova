"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ACTIVATION_PIN_WINDOW_HEADING_FR,
  ACTIVATION_PIN_WINDOW_HINT_FR,
  ActivationPinCard,
  accountPhone,
  isPartnerPinExemptPath,
  partnerNeedsKycActivationPin,
  type AuthPayload,
} from "@/components/PinAuth";
import { apiFetch, fetchKyc } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  RENTAL_AUTH_INTENT,
  dropTokenKeepPhone,
  getLastPhone,
  getToken,
  isLoginPinConfirmed,
  isPinPending,
  isPinSessionUnlocked,
  isRentalPartnerRole,
  markLoginPinConfirmed,
  normalizeLoginPhone,
  phoneFromToken,
  roleFromToken,
  setLastPhone,
  setPinPending,
  setToken,
  userIdFromToken,
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
  const [needsActivation, setNeedsActivation] = useState(false);
  const [activateIdentity, setActivateIdentity] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token || !isRentalPartnerRole(roleFromToken())) {
      router.replace("/login");
      return;
    }
    if (isPinPending()) {
      setPinPending(false);
    }
    let cancelled = false;

    async function check() {
      try {
        const [me, kyc] = await Promise.all([
          apiFetch<Me>("/api/users/me"),
          fetchKyc().catch(() => null),
        ]);
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
        const pinConfigured =
          me.pinConfigured === true || kyc?.pinConfigured === true
            ? true
            : me.pinConfigured === false && kyc?.pinConfigured !== true
              ? false
              : me.pinConfigured ?? kyc?.pinConfigured;
        const needsPin = partnerNeedsKycActivationPin({
          pinConfigured,
          kycStatus: kyc?.kycStatus,
          canOperate: kyc?.canOperate,
          unlocked: isLoginPinConfirmed() || isPinSessionUnlocked(),
          identity: fallback,
        });
        if (needsPin) {
          setActivateIdentity(fallback);
          setNeedsActivation(true);
          setReady(true);
          return;
        }
        setNeedsActivation(false);
        setReady(true);
      } catch {
        dropTokenKeepPhone(phoneFromToken() || getLastPhone() || "");
        router.replace("/login");
      }
    }

    void check();
    const poll = window.setInterval(() => {
      if (!cancelled && !isLoginPinConfirmed() && !isPinSessionUnlocked()) void check();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [router, pathname]);

  if (needsActivation && !isPartnerPinExemptPath(pathname)) {
    const uid = userIdFromToken();
    return (
      <div className="fixed inset-0 z-[10050] bg-gradient-to-br from-indigo-50 to-violet-50 overflow-y-auto">
        <div className="min-h-[100dvh] flex items-start justify-center p-6 pt-10 pb-16">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            <p className="text-center text-sm text-gray-500 mb-4">SENGA Location</p>
            <ActivationPinCard
              apiBase={PUBLIC_API_BASE}
              intent={{ ...RENTAL_AUTH_INTENT, ...(uid ? { userId: uid } : {}) }}
              accentClass="bg-indigo-600"
              highlightClass="border-indigo-400 bg-indigo-50"
              heading={ACTIVATION_PIN_WINDOW_HEADING_FR}
              hint={ACTIVATION_PIN_WINDOW_HINT_FR}
              lockIdentity
              defaultIdentity={activateIdentity}
              normalizeIdentity={normalizeLoginPhone}
              onActivated={(data: AuthPayload) => {
                const phone = accountPhone(data, activateIdentity);
                if (data.accessToken) setToken(data.accessToken, phone || undefined);
                if (phone) setLastPhone(phone);
                markLoginPinConfirmed();
                setNeedsActivation(false);
                setReady(true);
              }}
            />
            <Link href="/dossier" className="block text-center text-sm text-indigo-800 underline mt-4">
              Ouvrir mon dossier
            </Link>
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
