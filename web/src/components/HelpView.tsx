"use client";

import { HelpIcon } from "./ServiceIcons";

const FAQ = [
  {
    q: "Comment créer un compte MOVA ?",
    a: "Saisissez votre numéro +243 (9 chiffres), puis le code OTP reçu par SMS.",
  },
  {
    q: "Quels moyens de paiement sont acceptés ?",
    a: "Orange Money, M-Pesa, Airtel Money et portefeuille MOVA — montants en CDF.",
  },
  {
    q: "Dans quelles zones MOVA est-il disponible ?",
    a: "MOVA couvre 32 zones de service à travers la RDC. Choisissez votre ville ou laissez le GPS détecter la zone la plus proche.",
  },
  {
    q: "Comment contacter le support ?",
    a: "WhatsApp +243 900 000 000, support@mova.cd, Lun–Sam 8h–20h (Africa/Kinshasa).",
  },
  {
    q: "Comment annuler une course ?",
    a: "Avant confirmation : gratuit. Après affectation d'un chauffeur : frais possibles selon le délai.",
  },
];

type Props = { onBack: () => void };

export function HelpView({ onBack }: Props) {
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
        <h2 className="text-lg font-bold">Centre d&apos;aide MOVA</h2>
      </div>
      <p className="text-sm text-gray-500">
        Documentation et support — RDC
      </p>

      <section className="bg-[#F5F4FF] rounded-xl p-4 space-y-2">
        <h3 className="font-semibold text-[#1A1A2E]">Contacter le support</h3>
        <p className="text-sm">
          <span className="text-gray-500">Téléphone :</span>{" "}
          <a href="tel:+243900000000" className="text-[#6C63FF]">
            +243 900 000 000
          </a>
        </p>
        <p className="text-sm">
          <span className="text-gray-500">E-mail :</span>{" "}
          <a href="mailto:support@mova.cd" className="text-[#6C63FF]">
            support@mova.cd
          </a>
        </p>
        <p className="text-sm">
          <span className="text-gray-500">WhatsApp :</span>{" "}
          <a
            href="https://wa.me/243900000000"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6C63FF]"
          >
            +243 900 000 000
          </a>
        </p>
        <p className="text-xs text-gray-500">Lun–Sam 8h–20h (Africa/Kinshasa)</p>
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
        <p>
          <strong className="text-[#1A1A2E]">Manuel complet</strong> — disponible
          dans l&apos;application mobile MOVA Passager.
        </p>
        <p>CGU et politique de confidentialité : voir l&apos;app mobile.</p>
      </section>
    </div>
  );
}
