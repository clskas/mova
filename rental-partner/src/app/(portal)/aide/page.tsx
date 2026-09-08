"use client";

import { useEffect, useState } from "react";
import { fetchCompanyContacts, type CompanyContact } from "@/lib/api";

const MANUAL = [
  {
    title: "Activer le compte (PIN après KYC)",
    steps: [
      "Ouvrez https://rental.afri-soft.com/login — carte indigo « PIN d'activation (e-mail / SMS après validation KYC) ».",
      "Champ e-mail ou +243, puis « Code PIN à 6 chiffres », bouton « Ouvrir la session avec le PIN ».",
      "Google est plus bas (optionnel). Déjà connecté : « Activer avec le PIN reçu par e-mail ».",
    ],
  },
  {
    title: "Entreprise ou particulier",
    steps: [
      "Ouvrez Mon dossier et choisissez votre type.",
      "Entreprise : RCCM, NIF, statuts, pièce du gérant, preuve de siège.",
      "Particulier : pièce d’identité et preuve d’adresse.",
      "Les papiers de chaque véhicule se demandent à l’ajout du véhicule.",
    ],
  },
  {
    title: "Dossier avant publication",
    steps: [
      "Envoyez tous les justificatifs demandés.",
      "Attendez la validation SENGA.",
      "Tant que le dossier n’est pas validé, vous ne pouvez pas publier de véhicules.",
    ],
  },
  {
    title: "Véhicules",
    steps: [
      "Après validation, ouvrez Véhicules.",
      "Ajoutez chaque voiture avec ses papiers et une photo.",
      "SENGA vérifie le véhicule avant qu’il apparaisse aux clients.",
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

function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`;
}

function waHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export default function RentalAidePage() {
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
        <p className="text-sm text-gray-500 mt-1">Manuel location et contacts AfriSoft.</p>
      </div>

      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold text-[#1A1A2E]">Manuel utilisateur</h3>
        <p className="text-sm text-gray-600 mt-1">
          Connexion, PIN d&apos;activation après validation KYC, dossier, véhicules et réservations.
        </p>
        <a href="/manuel" className="inline-block mt-2 text-indigo-700 underline font-medium text-sm">
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

      <section className="bg-indigo-50 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-[#1A1A2E]">Contacts</h3>
        {!loaded ? (
          <p className="text-sm text-gray-500">Chargement des contacts…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun contact pour le moment.</p>
        ) : (
          contacts.map((contact) => {
            const wa = contact.phone ? waHref(contact.phone) : null;
            return (
              <div key={contact.id || contact.name} className="text-sm space-y-1 border-t border-indigo-100 pt-2 first:border-0 first:pt-0">
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
                    <a href={telHref(contact.phone)} className="text-indigo-700">
                      {contact.phone}
                    </a>
                  </p>
                )}
                {contact.email && (
                  <p>
                    E-mail :{" "}
                    <a href={`mailto:${contact.email}`} className="text-indigo-700">
                      {contact.email}
                    </a>
                  </p>
                )}
                {wa && (
                  <p>
                    WhatsApp :{" "}
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="text-indigo-700">
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
