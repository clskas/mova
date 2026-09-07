"use client";

import Link from "next/link";

const CHAPTERS = [
  {
    title: "Première connexion et PIN",
    steps: [
      "Connectez-vous sur le portail location avec votre numéro +243 (code SMS).",
      "Complétez Mon dossier et attendez la validation SENGA.",
      "Après validation, vous recevez un PIN à 6 chiffres par SMS ou e-mail. Conservez-le : il sert à ouvrir le portail.",
      "Si le SMS n'arrive pas, l'équipe SENGA peut renvoyer le PIN depuis l'admin (KYC ou fiche Utilisateur).",
    ],
  },
  {
    title: "Entreprise ou particulier",
    steps: [
      "Ouvrez Mon dossier et choisissez votre type.",
      "Entreprise : RCCM, NIF, statuts, pièce du gérant, preuve de siège.",
      "Particulier : pièce d'identité et preuve d'adresse.",
      "Les papiers de chaque véhicule se demandent à l'ajout du véhicule.",
    ],
  },
  {
    title: "Dossier avant publication",
    steps: [
      "Envoyez tous les justificatifs demandés.",
      "Attendez la validation SENGA.",
      "Tant que le dossier n'est pas validé, vous ne pouvez pas publier de véhicules.",
    ],
  },
  {
    title: "Véhicules",
    steps: [
      "Après validation, ouvrez Véhicules.",
      "Ajoutez chaque voiture avec ses papiers et une photo.",
      "SENGA vérifie le véhicule avant qu'il apparaisse aux clients.",
    ],
  },
  {
    title: "Réservations et revenus",
    steps: [
      "Suivez les demandes dans Réservations.",
      "Confirmez ou refusez selon la disponibilité.",
      "Les gains apparaissent dans Revenus, en CDF.",
    ],
  },
];

export default function RentalManuelPage() {
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-bold">Manuel utilisateur</h2>
        <p className="text-sm text-gray-500 mt-1">Guide partenaire location SENGA — Kinshasa, RDC.</p>
      </div>
      {CHAPTERS.map((chapter) => (
        <details key={chapter.title} className="bg-white border rounded-xl p-3" open>
          <summary className="font-medium text-sm cursor-pointer">{chapter.title}</summary>
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-gray-600">
            {chapter.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
      <p className="text-sm text-gray-500">
        Contacts et questions :{" "}
        <Link href="/aide" className="text-indigo-700 underline font-medium">
          Aide
        </Link>
        .
      </p>
    </div>
  );
}
