"use client";

import Link from "next/link";

const CHAPTERS = [
  {
    title: "Première connexion et PIN",
    steps: [
      "Connectez-vous sur restaurant.afri-soft.com avec votre numéro +243 (code SMS).",
      "Complétez Mon dossier et attendez la validation SENGA.",
      "Après validation, vous recevez un PIN à 6 chiffres par SMS ou e-mail. Conservez-le : il sert à ouvrir le portail.",
      "Si le SMS n'arrive pas, l'équipe SENGA peut renvoyer le PIN depuis l'admin (KYC ou fiche Utilisateur).",
    ],
  },
  {
    title: "Dossier avant menus et commandes",
    steps: [
      "Ouvrez Mon dossier en premier.",
      "Envoyez vos justificatifs (activité, identité, local).",
      "Attendez la validation SENGA.",
      "Tant que le dossier n'est pas validé, vous ne pouvez pas vendre ni afficher le menu.",
    ],
  },
  {
    title: "Livreurs internes ou SENGA",
    steps: [
      "Dans Paramètres, choisissez qui livre.",
      "Livreurs SENGA : un livreur de la plateforme vient chercher la commande.",
      "Livreurs internes : ce sont vos propres livreurs (ajoutez-les par numéro).",
      "Mode mixte : vos livreurs d'abord, puis SENGA si besoin.",
    ],
  },
  {
    title: "Paiement à l'enlèvement",
    steps: [
      "Le client paie d'abord (portefeuille ou Mobile Money).",
      "L'argent est bloqué jusqu'au départ du plat.",
      "Vous êtes payé quand la commande est prise au restaurant.",
      "Un livreur SENGA est payé après le code PIN du client.",
    ],
  },
  {
    title: "Menus et commandes",
    steps: [
      "Une fois le dossier validé, ajoutez vos plats dans Menu.",
      "Ouvrez Commandes pour préparer et suivre.",
      "Dans Paramètres, indiquez si vous acceptez les commandes.",
    ],
  },
];

export default function RestaurantManuelPage() {
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-bold">Manuel utilisateur</h2>
        <p className="text-sm text-gray-500 mt-1">Guide restaurant SENGA — Kinshasa, RDC.</p>
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
        <Link href="/aide" className="text-orange-700 underline font-medium">
          Aide
        </Link>
        .
      </p>
    </div>
  );
}
