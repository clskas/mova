"use client";

import { useEffect, useState } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import { ActivationPinCard, accountPhone } from "@/components/PinAuth";
import { apiFetch } from "@/lib/api";
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
          intent={{ ...RESTAURANT_AUTH_INTENT }}
          accentClass="bg-[#FF6B35]"
          highlightClass="border-[#FF6B35] bg-orange-50"
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
