"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "@/components/PortalShell";
import { fetchProfile } from "@/lib/api";

export function PartnerPortalFrame({ children }: { children: React.ReactNode }) {
  const [partnerName, setPartnerName] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (!cancelled) setPartnerName(p.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return <PortalShell partnerName={partnerName}>{children}</PortalShell>;
}
