"use client";

import { ConnectionCard } from "@/components/ConnectionCard";

export default function ComptePage() {
  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-xl font-bold">Compte et connexion</h2>
      <p className="text-sm text-gray-500">
        Après validation SENGA, une fenêtre <strong>Code PIN d&apos;activation</strong> s&apos;affiche
        automatiquement (tableau de bord bloqué). Saisissez le PIN reçu par e-mail / SMS pour commencer
        à travailler. Après Déconnexion, le pavé <strong>Connexion</strong> redemande le PIN.
      </p>
      <p className="text-sm text-gray-500">
        Besoin d&apos;aide ? Ouvrez le{" "}
        <a href="/manuel" className="text-indigo-700 underline font-medium">
          Manuel utilisateur
        </a>{" "}
        ou les{" "}
        <a href="/aide" className="text-indigo-700 underline font-medium">
          Contacts
        </a>
        .
      </p>
      <ConnectionCard />
    </div>
  );
}
