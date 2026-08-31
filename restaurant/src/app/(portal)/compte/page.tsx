"use client";

import { ConnectionCard } from "@/components/ConnectionCard";

export default function ComptePage() {
  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-xl font-bold">Compte et connexion</h2>
      <p className="text-sm text-gray-500">
        Lier Google ou un numéro +243 — optionnel, les deux directions, un seul compte.
      </p>
      <ConnectionCard />
    </div>
  );
}
