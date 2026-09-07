"use client";

import { useEffect, useState } from "react";
import { HelpIcon } from "./ServiceIcons";
import { apiFetch } from "@/lib/api";

const MANUAL = [
  {
    title: "Connexion et code PIN",
    steps: [
      "Ouvrez SENGA. Entrez votre numéro +243, ou continuez avec Google.",
      "Au premier accès, créez un code PIN à 6 chiffres.",
      "Les prochaines fois, ouvrez le site et saisissez ce PIN.",
      "Ne donnez jamais votre PIN de connexion.",
    ],
  },
  {
    title: "Commander un taxi ou une moto",
    steps: [
      "Appuyez sur Taxi / Moto-taxi.",
      "Indiquez le départ et l’arrivée. Vous pouvez poser un pin sur la carte, puis « Utiliser cet emplacement ».",
      "Choisissez Moto ou Taxi (Standard, Confort ou VIP).",
      "Regardez le prix, puis confirmez.",
    ],
  },
  {
    title: "Le prix affiché",
    steps: [
      "Le prix que vous voyez avant de confirmer est le prix facturé.",
      "Ce n’est pas un compteur qui augmente pendant le trajet.",
    ],
  },
  {
    title: "Recharger le portefeuille",
    steps: [
      "Ouvrez Wallet SENGA.",
      "Appuyez sur Recharger.",
      "Choisissez Orange Money, M-Pesa ou Airtel Money.",
      "Validez le paiement sur votre téléphone. Le solde apparaît en CDF.",
    ],
  },
  {
    title: "Livraisons (colis et repas)",
    steps: [
      "Ouvrez Livraisons, puis colis ou repas.",
      "Indiquez l’enlèvement et la livraison (ou un restaurant).",
      "Confirmez le prix affiché — c’est le montant à payer.",
      "Pour un colis, donnez le code PIN seulement quand vous avez bien reçu.",
    ],
  },
];

const FAQ = [
  {
    q: "Comment créer un compte SENGA ?",
    a: "Saisissez votre numéro +243 (9 chiffres), puis le code OTP reçu par SMS — ou continuez avec Google.",
  },
  {
    q: "Puis-je lier mon numéro et Google ?",
    a: "Oui, c’est optionnel. Dans Compte et connexion (icône profil), liez Google ou votre +243. Vous pouvez aussi rester téléphone seul ou Google seul — un seul portefeuille si les deux sont liés.",
  },
  {
    q: "Quels moyens de paiement sont acceptés ?",
    a: "Orange Money, M-Pesa, Airtel Money et portefeuille SENGA — montants en CDF.",
  },
  {
    q: "Dans quelles zones SENGA est-il disponible ?",
    a: "SENGA couvre 32 zones de service à travers la RDC. Choisissez votre ville ou laissez le GPS détecter la zone la plus proche.",
  },
  {
    q: "Puis-je utiliser SENGA sur iPhone ?",
    a: "Oui, dans Safari (senga.afri-soft.com). Pour l'installer : Partager → Sur l'écran d'accueil. Il n'y a pas d'application native sur l'App Store iOS. Les notifications push, le GPS en arrière-plan et parfois Connexion Google restent plus fiables dans l'app Android ou dans Safari (pas en plein écran).",
  },
  {
    q: "Comment contacter le support ?",
    a: "Les coordonnées sont celles publiées par AfriSoft (Contacts de l'entreprise). Si la liste ci-dessus est vide, aucun contact n'a encore été ajouté.",
  },
  {
    q: "Comment annuler une course ?",
    a: "Avant confirmation : gratuit. Après affectation d'un chauffeur : frais possibles selon le délai.",
  },
];

type CompanyContact = {
  id?: string;
  name?: string;
  title?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

function parseContacts(raw: unknown): CompanyContact[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? "Contact"),
      title: item.title ? String(item.title) : null,
      department: item.department ? String(item.department) : null,
      phone: item.phone ? String(item.phone) : null,
      email: item.email ? String(item.email) : null,
      notes: item.notes ? String(item.notes) : null,
    }));
}

function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`;
}

function waHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

type Props = { onBack: () => void };

export function HelpView({ onBack }: Props) {
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/api/company-contacts")
      .then((raw) => {
        if (!cancelled) setContacts(parseContacts(raw));
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-[#6C63FF] text-sm font-medium"
      >
        ← Retour
      </button>

      <div className="flex items-center gap-2">
        <HelpIcon color="#6C63FF" size={24} />
        <h2 className="text-lg font-bold">Centre d&apos;aide SENGA</h2>
      </div>
      <p className="text-sm text-gray-500">
        Manuel et contacts — RDC
      </p>

      <section className="space-y-2">
        <h3 className="font-semibold text-[#1A1A2E]">Manuel</h3>
        <p className="text-sm text-gray-500">
          Guide court : courses, pin sur la carte, portefeuille, livraisons, PIN.
        </p>
        {MANUAL.map((chapter) => (
          <details
            key={chapter.title}
            className="bg-white border border-gray-100 rounded-lg p-3"
          >
            <summary className="font-medium text-sm cursor-pointer">
              {chapter.title}
            </summary>
            <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-gray-600">
              {chapter.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        ))}
      </section>

      <section className="bg-[#F5F4FF] rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-[#1A1A2E]">Contacts</h3>
        {!loaded ? (
          <p className="text-sm text-gray-500">Chargement des contacts…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun contact pour le moment.</p>
        ) : (
          contacts.map((contact) => {
            const wa = contact.phone ? waHref(contact.phone) : null;
            return (
              <div key={contact.id || contact.name} className="text-sm space-y-1 border-t border-white/60 pt-2 first:border-0 first:pt-0">
                <p className="font-medium text-[#1A1A2E]">{contact.name}</p>
                {(contact.title || contact.department) && (
                  <p className="text-gray-500 text-xs">
                    {[contact.title, contact.department].filter(Boolean).join(" · ")}
                  </p>
                )}
                {contact.notes && <p className="text-xs text-gray-500">{contact.notes}</p>}
                {contact.phone && (
                  <p>
                    <span className="text-gray-500">Téléphone :</span>{" "}
                    <a href={telHref(contact.phone)} className="text-[#6C63FF]">
                      {contact.phone}
                    </a>
                  </p>
                )}
                {contact.email && (
                  <p>
                    <span className="text-gray-500">E-mail :</span>{" "}
                    <a href={`mailto:${contact.email}`} className="text-[#6C63FF]">
                      {contact.email}
                    </a>
                  </p>
                )}
                {wa && (
                  <p>
                    <span className="text-gray-500">WhatsApp :</span>{" "}
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[#6C63FF]">
                      {contact.phone}
                    </a>
                  </p>
                )}
              </div>
            );
          })
        )}
      </section>

      <section>
        <h3 className="font-semibold mb-2">FAQ</h3>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="bg-white border border-gray-100 rounded-lg p-3"
            >
              <summary className="font-medium text-sm cursor-pointer">
                {item.q}
              </summary>
              <p className="text-sm text-gray-600 mt-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="text-sm text-gray-500 space-y-1">
        <p>CGU et politique de confidentialité : voir aussi l&apos;app mobile SENGA.</p>
      </section>
    </div>
  );
}
