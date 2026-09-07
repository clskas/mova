"use client";

import { ConnectionCard } from "@/components/ConnectionCard";

export default function ComptePage() {
  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-xl font-bold">Compte et connexion</h2>
      <p className="text-sm text-gray-500">
        Lier Google ou un numéro +243 — optionnel, les deux directions, un seul compte.
        Besoin d&apos;aide ? Ouvrez le{" "}
        <a href="/aide" className="text-orange-700 underline font-medium">
          Manuel
        </a>
        .
      </p>
      <ConnectionCard />
    </div>
  );
}
