"use client";

import { useEffect, useState } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import { ActivationPinCard, accountPhone } from "@/components/PinAuth";
import { apiFetch } from "@/lib/api";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import {
  RENTAL_AUTH_INTENT,
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
    setShowActivate(!isPinSessionUnlocked());
    const last = getLastPhone() || "";
    setIdentity(last);
    void (async () => {
      try {
        const me = await apiFetch<{ email?: string; phone?: string }>("/api/users/me");
        if (!last) setIdentity(me.phone || me.email || "");
      } catch {
        /* ignore — PIN form still usable */
      }
    })();
  }, []);

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-xl font-bold">Compte et connexion</h2>
      {showActivate && !activated && (
        <ActivationPinCard
          apiBase={PUBLIC_API_BASE}
          intent={{ ...RENTAL_AUTH_INTENT }}
          accentClass="bg-indigo-600"
          highlightClass="border-indigo-500 bg-indigo-50"
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
