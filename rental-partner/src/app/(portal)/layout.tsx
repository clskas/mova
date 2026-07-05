"use client";

import { AuthGate } from "@/components/AuthGate";
import { PartnerLiveProvider } from "@/components/PartnerLiveProvider";
import { PartnerPortalFrame } from "@/components/PartnerPortalFrame";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <PartnerLiveProvider>
        <PartnerPortalFrame>{children}</PartnerPortalFrame>
      </PartnerLiveProvider>
    </AuthGate>
  );
}
