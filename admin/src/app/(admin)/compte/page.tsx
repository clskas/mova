"use client";

import { ConnectionCard } from "@/components/ConnectionCard";
import { PageHeader } from "@/components/ui";

export default function ComptePage() {
  return (
    <div className="space-y-4 max-w-lg">
      <PageHeader
        title="Compte et connexion"
        subtitle="Lier Google ou un numéro +243 — optionnel, les deux directions, un seul compte SUPER_ADMIN."
      />
      <ConnectionCard />
    </div>
  );
}
