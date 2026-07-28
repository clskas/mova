import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — SENGA",
  description:
    "Conditions Générales d'Utilisation SENGA RDC : services, compte, paiements et responsabilités.",
  robots: { index: true, follow: true },
};

export default function CguPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="mb-6 text-sm text-[var(--mova-violet)]">
        <Link href="/" className="hover:underline">
          ← SENGA
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:underline">
          Confidentialité
        </Link>
      </p>

      <article className="space-y-6 text-[15px] leading-relaxed text-[var(--foreground)]">
        <header className="space-y-2 border-b border-black/10 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Conditions Générales d&apos;Utilisation — SENGA RDC
          </h1>
          <p>
            <strong>Dernière mise à jour :</strong> 12 juin 2026
            <br />
            <strong>Éditeur :</strong> SENGA SARL, Kinshasa, RDC
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">1. Objet</h2>
          <p>
            Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») régissent
            l&apos;accès et l&apos;utilisation de la plateforme SENGA, application mobile et
            services associés de mobilité urbaine, livraison et paiements, opérant en
            République Démocratique du Congo.
          </p>
          <p>
            En créant un compte ou en utilisant SENGA, vous acceptez sans réserve les
            présentes CGU.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. Services proposés</h2>
          <p>
            SENGA met en relation des utilisateurs passagers et des chauffeurs/livreurs
            indépendants pour :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Taxi / Moto-taxi</strong> — courses immédiates en ville
            </li>
            <li>
              <strong>Livraison colis</strong> — envoi et suivi de colis
            </li>
            <li>
              <strong>Réservation planifiée</strong> — trajets programmés jusqu&apos;à J+7
            </li>
            <li>
              <strong>Livraison repas</strong> — commande auprès de restaurants partenaires
            </li>
            <li>
              <strong>Courses &amp; commissions</strong> — achats effectués par un livreur pour
              le compte du passager
            </li>
            <li>
              <strong>Covoiturage</strong> — partage de trajets entre utilisateurs
            </li>
            <li>
              <strong>Location véhicule</strong> — location de voiture, SUV ou minibus
            </li>
            <li>
              <strong>Livraison express</strong> — envoi urgent de petits colis
            </li>
            <li>
              <strong>Déménagement</strong> — transport et manutention avec camion
            </li>
            <li>
              <strong>Portefeuille SENGA</strong> — solde, recharge et paiements
            </li>
            <li>
              <strong>Historique</strong> — consultation des transactions passées
            </li>
          </ul>
          <p>
            SENGA agit exclusivement en qualité d&apos;intermédiaire technologique. Les
            prestataires de transport et de livraison sont des travailleurs indépendants.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Inscription et compte</h2>
          <h3 className="text-lg font-medium">3.1 Éligibilité</h3>
          <p>
            Vous devez être majeur (18 ans) et disposer d&apos;un numéro de téléphone mobile
            valide au format <strong>+243</strong> suivi de 9 chiffres.
          </p>
          <h3 className="text-lg font-medium">3.2 Vérification</h3>
          <p>
            L&apos;inscription requiert la validation OTP par SMS. Les chauffeurs doivent
            compléter une vérification KYC (permis, carte grise, pièce d&apos;identité).
          </p>
          <h3 className="text-lg font-medium">3.3 Sécurité du compte</h3>
          <p>
            Vous êtes responsable de la confidentialité de votre code OTP et de votre
            appareil. Signalez immédiatement toute utilisation non autorisée à{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:support@mova.cd">
              support@mova.cd
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">4. Tarification et paiements</h2>
          <h3 className="text-lg font-medium">4.1 Devise</h3>
          <p>
            Tous les prix sont affichés en <strong>Francs congolais (CDF / FC)</strong>.
          </p>
          <h3 className="text-lg font-medium">4.2 Moyens de paiement</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Orange Money</li>
            <li>M-Pesa (Vodacom)</li>
            <li>Airtel Money</li>
            <li>Portefeuille SENGA</li>
          </ul>
          <h3 className="text-lg font-medium">4.3 Estimation</h3>
          <p>
            Les prix affichés avant confirmation sont des estimations. Le montant final peut
            varier selon le trafic, la distance réelle ou les suppléments applicables.
          </p>
          <h3 className="text-lg font-medium">4.4 Annulation</h3>
          <p>
            Les conditions d&apos;annulation et d&apos;éventuels frais sont communiquées avant
            confirmation de chaque commande.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">5. Obligations des utilisateurs</h2>
          <p>Le passager s&apos;engage à :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Fournir des adresses exactes et des informations véridiques</li>
            <li>Respecter les chauffeurs et livreurs</li>
            <li>Ne pas transporter de marchandises illicites ou dangereuses</li>
            <li>Payer les montants dus via les moyens autorisés</li>
          </ul>
          <p>Le chauffeur/livreur s&apos;engage à :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Disposer des documents légaux requis</li>
            <li>Respecter le code de la route</li>
            <li>Traiter les passagers et colis avec diligence</li>
            <li>
              Régler les dettes espèces (commissions SENGA) accumulées lors des paiements
              cash ; au-delà du seuil configuré par SENGA, l&apos;accès aux nouvelles courses
              peut être suspendu jusqu&apos;au règlement
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Données personnelles</h2>
          <p>
            Le traitement de vos données est décrit dans notre{" "}
            <Link href="/privacy" className="text-[var(--mova-violet)] underline">
              Politique de confidentialité
            </Link>
            . SENGA collecte notamment votre numéro de téléphone, votre position GPS pendant
            les courses, et l&apos;historique de vos transactions.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">7. Responsabilité</h2>
          <p>
            SENGA ne saurait être tenue responsable des actes des chauffeurs/livreurs
            indépendants, des retards dus au trafic, aux intempéries ou à des cas de force
            majeure, ni des pertes ou dommages liés au contenu des colis, sous réserve des
            dispositions légales impératives.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">8. Suspension et résiliation</h2>
          <p>
            SENGA se réserve le droit de suspendre ou résilier un compte en cas de violation
            des présentes CGU, de fraude, ou de comportement dangereux.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">9. Modifications</h2>
          <p>
            SENGA peut modifier les présentes CGU. Les utilisateurs seront informés via
            l&apos;application. La poursuite de l&apos;utilisation vaut acceptation.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">10. Droit applicable et litiges</h2>
          <p>
            Les présentes CGU sont soumises au <strong>droit congolais</strong>. Tout litige
            relève de la compétence exclusive des tribunaux de <strong>Kinshasa</strong>,
            sauf disposition légale contraire.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">11. Contact</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/15">
                  <th className="py-2 pr-3 font-semibold">Canal</th>
                  <th className="py-2 font-semibold">Coordonnées</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">Support WhatsApp</td>
                  <td className="py-2">+243 900 000 000</td>
                </tr>
                <tr className="border-b border-black/10">
                  <td className="py-2 pr-3">E-mail</td>
                  <td className="py-2">
                    <a
                      className="text-[var(--mova-violet)] underline"
                      href="mailto:support@mova.cd"
                    >
                      support@mova.cd
                    </a>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Adresse</td>
                  <td className="py-2">Kinshasa, RDC</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </main>
  );
}
