"use client";

import { ConnectionCard } from "@/components/ConnectionCard";
import { PageHeader } from "@/components/ui";

export default function ComptePage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Compte et connexion" subtitle="Lier téléphone et Google — optionnel, les deux directions." />
      <ConnectionCard />
    </div>
  );
}
