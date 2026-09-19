"use client";

import { useEffect, useState } from "react";
import { DocumentsReminderBanner } from "@/components/DocumentsReminderBanner";
import { PortalShell } from "@/components/PortalShell";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { fetchProfile } from "@/lib/api";

export function PartnerPortalFrame({ children }: { children: React.ReactNode }) {
  const [partnerName, setPartnerName] = useState<string>();
  const [docsReminder, setDocsReminder] = useState<{ message: string; blocked?: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (!cancelled) {
          const label =
            p.businessName && p.businessName !== "Ma location"
              ? p.businessName
              : p.name && p.name !== "Ma location"
                ? p.name
                : undefined;
          setPartnerName(label);
          const rem = p.documentsReminder;
          if (rem?.active && rem.message) {
            setDocsReminder({ message: rem.message, blocked: rem.blocked === true });
          } else {
            setDocsReminder(null);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalShell partnerName={partnerName}>
      {docsReminder ? (
        <DocumentsReminderBanner message={docsReminder.message} blocked={docsReminder.blocked} />
      ) : null}
      {children}
      <PwaInstallBanner />
    </PortalShell>
  );
}
