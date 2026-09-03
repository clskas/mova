"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { PortalShell } from "@/components/PortalShell";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PartnerAlertHost } from "@/components/PartnerAlertHost";
import { RestaurantLiveProvider } from "@/components/RestaurantLiveProvider";
import { fetchProfile } from "@/lib/api";

function RestaurantPortalFrame({ children }: { children: React.ReactNode }) {
  const [restaurantName, setRestaurantName] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (!cancelled) setRestaurantName(p.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalShell restaurantName={restaurantName}>
      {children}
      <PwaInstallBanner />
    </PortalShell>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <RestaurantLiveProvider>
        <PartnerAlertHost />
        <RestaurantPortalFrame>{children}</RestaurantPortalFrame>
      </RestaurantLiveProvider>
    </AuthGate>
  );
}
