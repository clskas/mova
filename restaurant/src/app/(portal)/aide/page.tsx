"use client";

import { useEffect, useMemo, useState } from "react";
import { useCommerceCopy, useCommerceType } from "@/components/CommerceTypeContext";
import { fetchCompanyContacts, type CompanyContact } from "@/lib/api";
import { commerceHelpChapters } from "@/lib/commerce-type";

function telHref(phone: string) {
  return `tel:${phone.replace(/\s/g, "")}`;
}

function waHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export default function RestaurantAidePage() {
  const commerceType = useCommerceType();
  const copy = useCommerceCopy();
  const chapters = useMemo(() => commerceHelpChapters(commerceType), [commerceType]);
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
        <p className="text-sm text-gray-500 mt-1">{copy.aideIntro}</p>
      </div>

      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold text-[#1A1A2E]">Manuel utilisateur</h3>
        <p className="text-sm text-gray-600 mt-1">
          Connexion, PIN d&apos;activation après validation KYC, dossier, {copy.catalogNoun.toLowerCase()} et
          commandes.
        </p>
        <a href="/manuel" className="inline-block mt-2 text-orange-700 underline font-medium text-sm">
          Ouvrir le manuel utilisateur
        </a>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-[#1A1A2E]">Aide rapide</h3>
        {chapters.map((chapter) => (
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
