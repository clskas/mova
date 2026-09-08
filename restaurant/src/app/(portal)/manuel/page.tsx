"use client";

import Link from "next/link";

const CHAPTERS = [
  {
    title: "Première connexion et PIN",
    steps: [
      "Ouvrez https://restaurant.afri-soft.com/login — Google, ou téléphone / e-mail (SMS). Ce n'est pas l'écran d'activation.",
      "Après connexion, si le dossier n'est pas encore validé, ouvrez Mon dossier pour envoyer les justificatifs. Le PIN d'activation n'apparaît pas avant la validation KYC.",
      "Quand SENGA valide le dossier, un PIN à 6 chiffres arrive par e-mail (objet « Votre acces SENGA restaurant »).",
      "Une fois connecté, si le dossier est validé et que vous n'avez pas encore saisi ce PIN, la fenêtre « Code PIN d'activation » (6 chiffres seulement) bloque le tableau de bord, les commandes et le menu.",
      "Mon dossier, Compte et Aide restent accessibles. Ce n'est pas un code Google.",
      "Si le PIN n'arrive pas, l'équipe SENGA le renvoie depuis l'admin (KYC ou fiche Utilisateur) — vérifiez aussi le spam Gmail.",
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
