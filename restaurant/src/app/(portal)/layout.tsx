"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { PortalShell } from "@/components/PortalShell";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PartnerAlertHost } from "@/components/PartnerAlertHost";
import { RestaurantLiveProvider } from "@/components/RestaurantLiveProvider";
import { fetchProfile } from "@/lib/api";
import { parseCommerceType, type CommerceType } from "@/lib/commerce-type";

function RestaurantPortalFrame({ children }: { children: React.ReactNode }) {
  const [restaurantName, setRestaurantName] = useState<string>();
  const [commerceType, setCommerceType] = useState<CommerceType>("RESTAURANT");

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (cancelled) return;
        setRestaurantName(p.name);
        setCommerceType(parseCommerceType(p.commerceType));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalShell restaurantName={restaurantName} commerceType={commerceType}>
      {children}
      <PwaInstallBanner />
    </PortalShell>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RestaurantLiveProvider>
      <PartnerAlertHost />
      <AuthGate>
        <RestaurantPortalFrame>{children}</RestaurantPortalFrame>
      </AuthGate>
    </RestaurantLiveProvider>
  );
}
