"use client";

import Link from "next/link";

/** Bannière d'accueil — rappel documents obligatoires (jours / heures restants). */
export function DocumentsReminderBanner({
  message,
  blocked,
}: {
  message: string;
  blocked?: boolean;
}) {
  return (
    <div
      className={`mb-3 rounded-xl border px-3 py-2.5 text-sm ${
        blocked
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-violet-200 bg-violet-50 text-violet-950"
      }`}
      role="status"
    >
      <p className="leading-snug">{message}</p>
      <Link href="/dossier" className="mt-1.5 inline-block text-xs font-semibold underline">
        Déposer les documents
      </Link>
    </div>
  );
}
