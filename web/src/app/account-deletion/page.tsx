import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Suppression de compte — SENGA",
  description:
    "Comment demander la suppression de votre compte SENGA et quelles données sont effacées ou conservées.",
  robots: { index: true, follow: true },
};

export default function AccountDeletionPage() {
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
        {" · "}
        <Link href="/cgu" className="hover:underline">
          CGU
        </Link>
      </p>

      <article className="space-y-8 text-[15px] leading-relaxed text-[var(--foreground)]">
        <header className="space-y-2 border-b border-black/10 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Suppression de compte — SENGA
          </h1>
          <p className="text-sm text-black/60">
            Account deletion request — SENGA (RDC)
          </p>
        </header>

        {/* ——— Français ——— */}
        <section className="space-y-4" lang="fr">
          <h2 className="text-xl font-semibold">Comment supprimer votre compte</h2>
          <p>
            Pour demander la suppression de votre compte SENGA (passager ou chauffeur),
            envoyez un e-mail à{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:support@mova.cd">
              support@mova.cd
            </a>{" "}
            (ou{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:privacy@mova.cd">
              privacy@mova.cd
            </a>
            ) depuis le numéro ou l&apos;adresse associés à votre compte.
          </p>
          <p>
            Vous pouvez aussi nous écrire via WhatsApp :{" "}
            <strong>+243 900 000 000</strong> (Lun–Sam 8h–20h, Africa/Kinshasa).
          </p>

          <h3 className="text-lg font-medium">Étapes</h3>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Ouvrez un e-mail avec l&apos;objet :{" "}
              <em>« Demande de suppression de compte SENGA »</em>.
            </li>
            <li>
              Indiquez votre numéro de téléphone au format <strong>+243…</strong> et précisez
              si vous êtes passager ou chauffeur.
            </li>
            <li>
              Nous vérifions votre identité, puis confirmons la suppression (généralement sous{" "}
              <strong>7 jours ouvrés</strong>).
            </li>
            <li>
              Après confirmation, vous ne pourrez plus vous connecter avec ce compte.
            </li>
          </ol>

          <h3 className="text-lg font-medium">Dans l&apos;application</h3>
          <p>
            Il n&apos;y a pas encore de bouton « Supprimer mon compte » dans le profil. Vous
            pouvez aussi consulter{" "}
            <strong>Aide → FAQ → « Comment supprimer mon compte ? »</strong>, qui renvoie vers
            le même contact support / DPO.
          </p>

          <h3 className="text-lg font-medium">Données effacées</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Compte et identifiants (numéro, profil, photo)</li>
            <li>Accès à l&apos;application et au portefeuille lié au compte</li>
            <li>Préférences et données non nécessaires après clôture</li>
          </ul>

          <h3 className="text-lg font-medium">Données pouvant être conservées</h3>
          <p>
            Conformément à notre{" "}
            <Link href="/privacy" className="text-[var(--mova-violet)] underline">
              politique de confidentialité
            </Link>
            , certaines données peuvent être retenues pour obligations légales ou litiges :
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Historique des courses / transactions : jusqu&apos;à <strong>3 ans</strong></li>
            <li>Documents KYC chauffeur : jusqu&apos;à <strong>5 ans</strong> après fin de collaboration</li>
            <li>Journaux techniques anonymisés : jusqu&apos;à <strong>12 mois</strong></li>
          </ul>

          <h3 className="text-lg font-medium">Suppression partielle (sans fermer le compte)</h3>
          <p>
            Vous pouvez demander l&apos;effacement de certaines données (ex. photo de profil,
            nom) sans supprimer le compte en écrivant à{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:support@mova.cd">
              support@mova.cd
            </a>{" "}
            ou{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:privacy@mova.cd">
              privacy@mova.cd
            </a>
            .
          </p>
        </section>

        {/* ——— English ——— */}
        <section
          className="space-y-4 border-t border-black/10 pt-8"
          lang="en"
        >
          <h2 className="text-xl font-semibold">How to request account deletion</h2>
          <p>
            To delete your SENGA account (passenger or driver), email{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:support@mova.cd">
              support@mova.cd
            </a>{" "}
            or{" "}
            <a className="text-[var(--mova-violet)] underline" href="mailto:privacy@mova.cd">
              privacy@mova.cd
            </a>
            , or message WhatsApp <strong>+243 900 000 000</strong>. Include your{" "}
            <strong>+243</strong> phone number and whether you are a passenger or driver.
          </p>
          <p>
            There is currently <strong>no in-app delete button</strong> in Profile. Use Help →
            FAQ → “How do I delete my account?” or contact support as above. We typically
            process requests within <strong>7 business days</strong> after identity
            verification.
          </p>
          <p>
            <strong>Deleted:</strong> account, profile, and app access.{" "}
            <strong>May be retained</strong> as required by law (e.g. ride/transaction history
            up to 3 years; driver KYC up to 5 years). You may also request partial data
            deletion without closing the account via the same contacts.
          </p>
        </section>

        <footer className="border-t border-black/10 pt-6 text-sm text-black/60">
          SENGA SARL · Kinshasa, RDC ·{" "}
          <a className="text-[var(--mova-violet)] underline" href="mailto:support@mova.cd">
            support@mova.cd
          </a>
        </footer>
      </article>
    </main>
  );
}
