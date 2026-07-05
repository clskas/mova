"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { PortalShell } from "@/components/PortalShell";
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

  return <PortalShell restaurantName={restaurantName}>{children}</PortalShell>;
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <RestaurantLiveProvider>
        <RestaurantPortalFrame>{children}</RestaurantPortalFrame>
      </RestaurantLiveProvider>
    </AuthGate>
  );
}
