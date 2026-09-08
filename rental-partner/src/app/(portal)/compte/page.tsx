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
import { apiFetch, fetchKyc } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  RENTAL_AUTH_INTENT,
  getLastPhone,
  isLoginPinConfirmed,
  isPinSessionUnlocked,
  markLoginPinConfirmed,
  normalizeLoginPhone,
  setLastPhone,
  setToken,
  userIdFromToken,
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
        const [me, kyc] = await Promise.all([
          apiFetch<{ email?: string; phone?: string; pinConfigured?: boolean }>("/api/users/me"),
          fetchKyc().catch(() => null),
        ]);
        if (!last) setIdentity(me.phone || me.email || "");
        const pinConfigured =
          me.pinConfigured === true || kyc?.pinConfigured === true
            ? true
            : me.pinConfigured === false && kyc?.pinConfigured !== true
              ? false
              : me.pinConfigured ?? kyc?.pinConfigured;
        setShowActivate(
          partnerNeedsKycActivationPin({
            pinConfigured,
            kycStatus: kyc?.kycStatus,
            canOperate: kyc?.canOperate,
            unlocked: isLoginPinConfirmed() || isPinSessionUnlocked(),
            identity: last || me.phone || me.email || "",
          }),
        );
      } catch {
        /* PIN form still usable after KYC via AuthGate on work pages */
      }
    })();
  }, []);

  const uid = userIdFromToken();

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-xl font-bold">Compte et connexion</h2>
      {showActivate && !activated && (
        <ActivationPinCard
          apiBase={PUBLIC_API_BASE}
          intent={{ ...RENTAL_AUTH_INTENT, ...(uid ? { userId: uid } : {}) }}
          accentClass="bg-indigo-600"
          highlightClass="border-indigo-500 bg-indigo-50"
          heading={ACTIVATION_PIN_WINDOW_HEADING_FR}
          hint={ACTIVATION_PIN_WINDOW_HINT_FR}
          lockIdentity
          defaultIdentity={identity}
          normalizeIdentity={normalizeLoginPhone}
          onActivated={(data) => {
            const remembered = accountPhone(data, identity);
            if (data.accessToken) setToken(data.accessToken, remembered || undefined);
            if (remembered) setLastPhone(remembered);
            markLoginPinConfirmed();
            setActivated(true);
            window.location.replace("/");
          }}
        />
      )}
      <p className="text-sm text-gray-500">
        Besoin d&apos;aide ? Ouvrez le{" "}
        <a href="/manuel" className="text-indigo-700 underline font-medium">
          Manuel utilisateur
        </a>{" "}
        ou les{" "}
        <a href="/aide" className="text-indigo-700 underline font-medium">
          Contacts
        </a>
        .
      </p>
      <ConnectionCard />
    </div>
  );
}
