"use client";

import { useEffect, useState } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import {
  ACTIVATION_PIN_WINDOW_HEADING_FR,
  ACTIVATION_PIN_WINDOW_HINT_FR,
  ActivationPinCard,
  accountPhone,
  partnerNeedsKycActivationPin,
} from "@/components/PinAuth";
import { apiFetch, fetchProfile } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  RESTAURANT_AUTH_INTENT,
  getLastPhone,
  isPinSessionUnlocked,
  markPinSessionUnlocked,
  normalizeLoginPhone,
  setLastPhone,
  setToken,
} from "@/lib/auth";

export default function ComptePage() {
  const [identity, setIdentity] = useState("");
  const [activated, setActivated] = useState(false);
  const [showActivate, setShowActivate] = useState(false);

  useEffect(() => {
    const last = getLastPhone() || "";
    setIdentity(last);
    void (async () => {
      try {
        const [me, profile] = await Promise.all([
          apiFetch<{ email?: string; phone?: string }>("/api/users/me"),
          fetchProfile().catch(() => null),
        ]);
        if (!last) setIdentity(me.phone || me.email || "");
        setShowActivate(
          partnerNeedsKycActivationPin({
            kycStatus: profile?.kycStatus,
            unlocked: isPinSessionUnlocked(),
            identity: last || me.phone || me.email || "",
          }),
        );
      } catch {
        /* PIN form still usable after KYC via AuthGate on work pages */
      }
    })();
  }, []);

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-xl font-bold">Compte et connexion</h2>
      {showActivate && !activated && (
        <ActivationPinCard
          apiBase={PUBLIC_API_BASE}
          intent={{ ...RESTAURANT_AUTH_INTENT }}
          accentClass="bg-[#FF6B35]"
          highlightClass="border-[#FF6B35] bg-orange-50"
          heading={ACTIVATION_PIN_WINDOW_HEADING_FR}
          hint={ACTIVATION_PIN_WINDOW_HINT_FR}
          lockIdentity
          defaultIdentity={identity}
          normalizeIdentity={normalizeLoginPhone}
          onActivated={(data) => {
            const remembered = accountPhone(data, identity);
            if (data.accessToken) setToken(data.accessToken, remembered || undefined);
            if (remembered) setLastPhone(remembered);
            markPinSessionUnlocked();
            setActivated(true);
            window.location.replace("/");
          }}
        />
      )}
      <p className="text-sm text-gray-500">
        Lier Google ou un numéro +243 — optionnel, les deux directions, un seul compte.
        Besoin d&apos;aide ? Ouvrez le{" "}
        <a href="/aide" className="text-orange-700 underline font-medium">
          Manuel
        </a>
        .
      </p>
      <ConnectionCard />
    </div>
  );
}
