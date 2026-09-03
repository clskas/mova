"use client";

import { AuthGate } from "@/components/AuthGate";
import { PartnerAlertHost } from "@/components/PartnerAlertHost";
import { PartnerLiveProvider } from "@/components/PartnerLiveProvider";
import { PartnerPortalFrame } from "@/components/PartnerPortalFrame";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <PartnerLiveProvider>
        <PartnerAlertHost />
        <PartnerPortalFrame>{children}</PartnerPortalFrame>
      </PartnerLiveProvider>
    </AuthGate>
  );
}
