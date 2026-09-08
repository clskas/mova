"use client";

import { useEffect, useState } from "react";
import { fetchCompanyContacts, type CompanyContact } from "@/lib/api";

const MANUAL = [
  {
    title: "Code PIN de connexion",
    steps: [
      "Connectez-vous sur https://restaurant.afri-soft.com/login avec Google ou votre téléphone.",
      "Première fois : code SMS (téléphone) ou code e-mail (après Google), puis fenêtre PIN de connexion (6 chiffres) pour les prochaines fois.",
      "Ce n'est pas un OTP Google, et ce n'est pas le titre « Activer le compte » sur toute la page.",
    ],
  },
  {
    title: "Dossier avant menus et commandes",
    steps: [
      "Ouvrez Mon dossier en premier.",
      "Envoyez vos justificatifs (activité, identité, local).",
      "Attendez la validation SENGA.",
      "Tant que le dossier n’est pas validé, vous ne pouvez pas vendre ni afficher le menu.",
    ],
  },
  {
    title: "Livreurs internes ou SENGA",
    steps: [
      "Dans Paramètres, choisissez qui livre.",
      "Livreurs SENGA : un livreur de la plateforme vient chercher la commande.",
      "Livreurs internes : ce sont vos propres livreurs (ajoutez-les par numéro).",
      "Mode mixte : vos livreurs d’abord, puis SENGA si besoin.",
    ],
  },
  {
    title: "Paiement à l’enlèvement",
    steps: [
      "Le client paie d’abord (portefeuille ou Mobile Money).",
      "L’argent est bloqué jusqu’au départ du plat.",
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

function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`;
}

function waHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export default function RestaurantAidePage() {
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCompanyContacts()
      .then((list) => {
        if (!cancelled) setContacts(list);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-bold">Aide</h2>
        <p className="text-sm text-gray-500 mt-1">Manuel restaurant et contacts AfriSoft.</p>
      </div>

      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold text-[#1A1A2E]">Manuel utilisateur</h3>
        <p className="text-sm text-gray-600 mt-1">
          Connexion, PIN d&apos;activation après validation KYC, dossier, menu et commandes.
        </p>
        <a href="/manuel" className="inline-block mt-2 text-orange-700 underline font-medium text-sm">
          Ouvrir le manuel utilisateur
        </a>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-[#1A1A2E]">Aide rapide</h3>
        {MANUAL.map((chapter) => (
          <details key={chapter.title} className="bg-white border rounded-xl p-3">
            <summary className="font-medium text-sm cursor-pointer">{chapter.title}</summary>
            <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-gray-600">
              {chapter.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        ))}
      </section>

      <section className="bg-orange-50 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-[#1A1A2E]">Contacts</h3>
        {!loaded ? (
          <p className="text-sm text-gray-500">Chargement des contacts…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun contact pour le moment.</p>
        ) : (
          contacts.map((contact) => {
            const wa = contact.phone ? waHref(contact.phone) : null;
            return (
              <div key={contact.id || contact.name} className="text-sm space-y-1 border-t border-orange-100 pt-2 first:border-0 first:pt-0">
                <p className="font-medium">{contact.name}</p>
                {(contact.title || contact.department) && (
                  <p className="text-gray-500 text-xs">
                    {[contact.title, contact.department].filter(Boolean).join(" · ")}
                  </p>
                )}
                {contact.notes && <p className="text-xs text-gray-500">{contact.notes}</p>}
                {contact.phone && (
                  <p>
                    Téléphone :{" "}
                    <a href={telHref(contact.phone)} className="text-orange-700">
                      {contact.phone}
                    </a>
                  </p>
                )}
                {contact.email && (
                  <p>
                    E-mail :{" "}
                    <a href={`mailto:${contact.email}`} className="text-orange-700">
                      {contact.email}
                    </a>
                  </p>
                )}
                {wa && (
                  <p>
                    WhatsApp :{" "}
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="text-orange-700">
                      {contact.phone}
                    </a>
                  </p>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
