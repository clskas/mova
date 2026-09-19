"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { CommerceTypeProvider } from "@/components/CommerceTypeContext";
import { DocumentsReminderBanner } from "@/components/DocumentsReminderBanner";
import { PortalShell } from "@/components/PortalShell";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PartnerAlertHost } from "@/components/PartnerAlertHost";
import { RestaurantLiveProvider } from "@/components/RestaurantLiveProvider";
import { fetchProfile } from "@/lib/api";
import { parseCommerceType, type CommerceType } from "@/lib/commerce-type";

function RestaurantPortalFrame({ children }: { children: React.ReactNode }) {
  const [restaurantName, setRestaurantName] = useState<string>();
  const [commerceType, setCommerceType] = useState<CommerceType>("RESTAURANT");
  const [docsReminder, setDocsReminder] = useState<{ message: string; blocked?: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (cancelled) return;
        setRestaurantName(p.name);
        setCommerceType(parseCommerceType(p.commerceType));
        const rem = p.documentsReminder;
        if (rem?.active && rem.message) {
          setDocsReminder({ message: rem.message, blocked: rem.blocked === true });
        } else {
          setDocsReminder(null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CommerceTypeProvider commerceType={commerceType}>
      <PortalShell restaurantName={restaurantName} commerceType={commerceType}>
        {docsReminder ? (
          <DocumentsReminderBanner message={docsReminder.message} blocked={docsReminder.blocked} />
        ) : null}
        {children}
        <PwaInstallBanner />
      </PortalShell>
    </CommerceTypeProvider>
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
