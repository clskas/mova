"use client";

import Link from "next/link";

const CHAPTERS = [
  {
    title: "Première connexion et PIN",
    steps: [
      "Ouvrez https://rental.afri-soft.com/login — Google, ou téléphone / e-mail. Ce n'est pas l'écran « Activer le compte ».",
      "Téléphone : un code SMS arrive, puis la fenêtre PIN de connexion (6 chiffres) : « Choisissez / confirmez votre PIN de connexion pour les prochaines fois ».",
      "Google : après Google, un code arrive par e-mail (objet « Votre accès SENGA location », sans le mot OTP). Saisissez-le, puis la même fenêtre PIN de connexion.",
      "Après Déconnexion, le pavé Connexion s'affiche : « Entrez le PIN pour +243 ••• XXX », 6 points, clavier. Google ne reconnecte pas tout seul.",
      "Après validation SENGA, une fenêtre « Code PIN d'activation » bloque le tableau de bord. Saisissez le PIN reçu par e-mail / SMS pour commencer à travailler.",
      "Si le PIN n'arrive pas, l'équipe SENGA le renvoie depuis l'admin — vérifiez aussi le spam Gmail.",
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
