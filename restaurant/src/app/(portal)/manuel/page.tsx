"use client";

import Link from "next/link";

const CHAPTERS = [
  {
    title: "Première connexion et PIN",
    steps: [
      "Ouvrez https://restaurant.afri-soft.com/login — Google, ou téléphone / e-mail. Ce n'est pas l'écran « Activer le compte ».",
      "Téléphone : un code SMS arrive, puis la fenêtre PIN de connexion (6 chiffres) : « Choisissez / confirmez votre PIN de connexion pour les prochaines fois ».",
      "Google : après Google, un code arrive par e-mail (objet « Votre accès SENGA restaurant », sans le mot OTP). Saisissez-le, puis la même fenêtre PIN de connexion.",
      "Les fois suivantes : Google, ou téléphone / e-mail + PIN. Si le dossier est déjà validé, le PIN d'activation (même code) n'est pas redemandé sur cet écran.",
      "Si le PIN n'arrive pas, l'équipe SENGA le renvoie depuis l'admin — vérifiez aussi le spam Gmail.",
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
