import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité — SENGA",
  description:
    "Politique de confidentialité SENGA RDC : données collectées, finalités, droits et contact.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="mb-6 text-sm text-[var(--mova-violet)]">
        <Link href="/" className="hover:underline">
          ← SENGA
        </Link>
        {" · "}
        <Link href="/cgu" className="hover:underline">
          CGU
        </Link>
      </p>

      <article className="space-y-6 text-[15px] leading-relaxed text-[var(--foreground)]">
        <header className="space-y-2 border-b border-black/10 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Politique de Confidentialité — SENGA RDC
          </h1>
          <p>
            <strong>Dernière mise à jour :</strong> 12 juin 2026
            <br />
            <strong>Responsable du traitement :</strong> SENGA SARL, Kinshasa, RDC
            <br />
            <strong>DPO :</strong>{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:privacy@mova.cd">
              privacy@mova.cd
            </a>
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">1. Introduction</h2>
          <p>
            SENGA s&apos;engage à protéger la vie privée des utilisateurs de son application
            mobile (Passager et Chauffeur) conformément à la législation congolaise applicable
            en matière de protection des données personnelles.
          </p>
          <p>
            Cette politique explique quelles données nous collectons, pourquoi, comment
            longtemps, et quels sont vos droits.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. Données collectées</h2>

          <h3 className="text-lg font-medium">2.1 Données d&apos;identification</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Numéro de téléphone (+243)</li>
            <li>Nom (optionnel)</li>
            <li>Photo de profil (optionnel)</li>
          </ul>

          <h3 className="text-lg font-medium">2.2 Données de localisation</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Position GPS en temps réel <strong>pendant</strong> les courses, livraisons et
              trajets actifs
            </li>
            <li>Adresses de départ, d&apos;arrivée et de livraison saisies</li>
          </ul>

          <h3 className="text-lg font-medium">2.3 Données transactionnelles</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Historique des courses, colis, repas, réservations et courses</li>
            <li>Montants en CDF, moyens de paiement utilisés</li>
            <li>Solde du portefeuille SENGA</li>
          </ul>

          <h3 className="text-lg font-medium">2.4 Données chauffeur (KYC)</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Permis de conduire</li>
            <li>Carte grise du véhicule</li>
            <li>Photo d&apos;identité</li>
            <li>Statut de disponibilité et revenus</li>
          </ul>

          <h3 className="text-lg font-medium">2.5 Données techniques</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Identifiant de l&apos;appareil</li>
            <li>Version de l&apos;application</li>
            <li>Journaux d&apos;erreurs anonymisés</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Finalités du traitement</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/15">
                  <th className="py-2 pr-3 font-semibold">Finalité</th>
                  <th className="py-2 font-semibold">Base légale</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Fournir les services de mobilité et livraison</td>
                  <td className="py-2">Exécution du contrat</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Traiter les paiements mobile money</td>
                  <td className="py-2">Exécution du contrat</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Assurer la sécurité des utilisateurs</td>
                  <td className="py-2">Intérêt légitime</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Vérifier l&apos;identité des chauffeurs (KYC)</td>
                  <td className="py-2">Obligation légale</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Améliorer l&apos;application</td>
                  <td className="py-2">Intérêt légitime</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Support client</td>
                  <td className="py-2">Exécution du contrat</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">4. Partage des données</h2>
          <p>
            SENGA <strong>ne vend pas</strong> vos données. Elles peuvent être partagées avec :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Prestataires de paiement</strong> : Orange Money, M-Pesa, Airtel Money
              (traitement des transactions)
            </li>
            <li>
              <strong>Chauffeurs/livreurs</strong> : informations nécessaires à la prestation
              (nom, téléphone masqué, adresses)
            </li>
            <li>
              <strong>Autorités compétentes</strong> : sur demande légale ou en cas
              d&apos;urgence
            </li>
            <li>
              <strong>Prestataires techniques</strong> : hébergement cloud, sous contrat de
              confidentialité
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">5. Conservation</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/15">
                  <th className="py-2 pr-3 font-semibold">Type de données</th>
                  <th className="py-2 font-semibold">Durée</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Compte actif</td>
                  <td className="py-2">Durée de la relation contractuelle</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Historique des courses</td>
                  <td className="py-2">3 ans après la dernière transaction</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Documents KYC chauffeur</td>
                  <td className="py-2">5 ans après fin de collaboration</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Journaux techniques</td>
                  <td className="py-2">12 mois</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Sécurité</h2>
          <p>
            SENGA met en œuvre des mesures techniques et organisationnelles : chiffrement TLS
            des communications, authentification JWT, accès restreint aux données, sauvegardes
            régulières.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">7. Vos droits</h2>
          <p>
            Conformément à la législation congolaise, vous disposez des droits suivants :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Accès</strong> — obtenir une copie de vos données
            </li>
            <li>
              <strong>Rectification</strong> — corriger des données inexactes
            </li>
            <li>
              <strong>Suppression</strong> — demander l&apos;effacement de votre compte
            </li>
            <li>
              <strong>Opposition</strong> — vous opposer à certains traitements
            </li>
            <li>
              <strong>Portabilité</strong> — recevoir vos données dans un format structuré
            </li>
          </ul>
          <p>
            Pour exercer vos droits :{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:privacy@mova.cd">
              <strong>privacy@mova.cd</strong>
            </a>{" "}
            ou WhatsApp +243 900 000 000.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">8. Cookies et traceurs</h2>
          <p>
            L&apos;application mobile n&apos;utilise pas de cookies web. Des identifiants locaux
            (token d&apos;authentification) sont stockés de manière sécurisée sur votre
            appareil.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">9. Mineurs</h2>
          <p>
            SENGA n&apos;est pas destiné aux personnes de moins de 18 ans. Nous ne collectons
            pas sciemment de données de mineurs.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">10. Transferts internationaux</h2>
          <p>
            Les données sont hébergées prioritairement en Afrique. Tout transfert hors RDC
            fait l&apos;objet de garanties appropriées.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">11. Modifications</h2>
          <p>
            Cette politique peut être mise à jour. La date de dernière révision est indiquée
            en tête de document. Les modifications substantielles seront notifiées dans
            l&apos;application.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">12. Contact</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/15">
                  <th className="py-2 pr-3 font-semibold">Rôle</th>
                  <th className="py-2 font-semibold">Contact</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">DPO</td>
                  <td className="py-2">
                    <a
                      className="text-[var(--mova-violet)] underline"
                      href="mailto:privacy@mova.cd"
                    >
                      privacy@mova.cd
                    </a>
                  </td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Support</td>
                  <td className="py-2">
                    <a
                      className="text-[var(--mova-violet)] underline"
                      href="mailto:support@mova.cd"
                    >
                      support@mova.cd
                    </a>
                  </td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">WhatsApp</td>
                  <td className="py-2">+243 900 000 000</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Adresse</td>
                  <td className="py-2">Kinshasa, République Démocratique du Congo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </main>
  );
}
