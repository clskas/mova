"use client";

import { AuthGate } from "@/components/AuthGate";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
