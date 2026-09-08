"use client";

import Link from "next/link";

const CHAPTERS = [
  {
    title: "Première connexion et PIN",
    steps: [
      "Ouvrez https://rental.afri-soft.com/login — Google, ou téléphone / e-mail (SMS). Ce n'est pas l'écran d'activation.",
      "Après connexion, si le dossier n'est pas encore validé, ouvrez Mon dossier pour envoyer les justificatifs. Le PIN d'activation n'apparaît pas avant la validation KYC.",
      "Quand SENGA valide le dossier, un PIN à 6 chiffres arrive par e-mail.",
      "Une fois connecté, si le dossier est validé et que vous n'avez pas encore saisi ce PIN, la fenêtre « Code PIN d'activation » (6 chiffres seulement) bloque le tableau de bord et les réservations.",
      "Mon dossier, Compte et Aide restent accessibles. Ce n'est pas un code Google.",
      "Si le PIN n'arrive pas, l'équipe SENGA le renvoie depuis l'admin (KYC ou fiche Utilisateur) — vérifiez aussi le spam Gmail.",
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
