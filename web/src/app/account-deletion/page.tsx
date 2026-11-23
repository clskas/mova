import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Suppression de compte — SENGA",
  description:
    "Comment supprimer votre compte SENGA depuis l'application et quelles données sont effacées ou conservées.",
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
        <Link href="/support" className="hover:underline">
          Support
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
          <p className="text-sm text-black/60">Account deletion — SENGA (DR Congo)</p>
        </header>

        {/* ——— Français ——— */}
        <section className="space-y-4" lang="fr">
          <h2 className="text-xl font-semibold">Supprimer votre compte dans l&apos;application</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Ouvrez SENGA ou SENGA Driver et connectez-vous.</li>
            <li>
              Ouvrez votre profil : <strong>Mon profil</strong> (passager) ou{" "}
              <strong>menu → Compte et connexion</strong> (chauffeur).
            </li>
            <li>
              Touchez <strong>« Supprimer mon compte »</strong> en bas de l&apos;écran, puis
              confirmez deux fois.
            </li>
          </ol>
          <p>
            La suppression est immédiate. Elle n&apos;est pas possible pendant une course ou une
            livraison en cours : terminez-la ou annulez-la d&apos;abord. Le solde éventuel du
            portefeuille est perdu : utilisez-le ou retirez-le avant.
          </p>
          <p>
            Vous n&apos;avez plus accès à l&apos;application ? Contactez-nous depuis la page{" "}
            <Link href="/support" className="text-[var(--mova-violet)] underline">
              Support
            </Link>{" "}
            avec le numéro de téléphone du compte.
          </p>

          <h3 className="text-lg font-medium">Données effacées</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Nom, numéro de téléphone, e-mail, photo de profil et code PIN</li>
            <li>Liens de connexion Google / Apple</li>
            <li>Dossier chauffeur et documents (permis, carte grise, selfie de vérification)</li>
            <li>Notifications et appareils enregistrés</li>
          </ul>

          <h3 className="text-lg font-medium">Données conservées (anonymes)</h3>
          <p>
            L&apos;historique des courses, livraisons et paiements est conservé sans nom ni numéro,
            pour la comptabilité et les obligations légales (jusqu&apos;à 3 ans), comme le décrit la{" "}
            <Link href="/privacy" className="text-[var(--mova-violet)] underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </section>

        {/* ——— English ——— */}
        <section className="space-y-4 border-t border-black/10 pt-8" lang="en">
          <h2 className="text-xl font-semibold">Delete your account in the app</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open SENGA or SENGA Driver and sign in.</li>
            <li>
              Open your profile: <strong>My profile</strong> (passenger) or{" "}
              <strong>menu → Account and sign-in</strong> (driver).
            </li>
            <li>
              Tap <strong>“Delete my account”</strong> at the bottom of the screen and confirm
              twice.
            </li>
          </ol>
          <p>
            Deletion is immediate. It is not possible while a ride or delivery is under way. Any
            wallet balance is lost. No access to the app any more? Contact us from the{" "}
            <Link href="/support" className="text-[var(--mova-violet)] underline">
              Support
            </Link>{" "}
            page with the account&apos;s phone number.
          </p>
          <p>
            <strong>Erased:</strong> name, phone, e-mail, photo, PIN, Google/Apple links, driver
            file and documents, notifications. <strong>Kept anonymously:</strong> ride, delivery
            and payment history for accounting and legal duties (up to 3 years).
          </p>
        </section>

        <footer className="border-t border-black/10 pt-6 text-sm text-black/60">
          SENGA · AfriSoft · Kinshasa, RDC ·{" "}
          <Link href="/support" className="text-[var(--mova-violet)] underline">
            Support
          </Link>
        </footer>
      </article>
    </main>
  );
}
