import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — SENGA",
  description:
    "Aide et support SENGA : contacter l'équipe, questions fréquentes, suppression de compte. Support and contact for the SENGA apps.",
  robots: { index: true, follow: true },
};

type Contact = {
  id: string;
  name?: string | null;
  title?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
};

/** Same contacts as the apps (Aide → Contacter le support), kept in Admin → Contacts société. */
async function loadContacts(): Promise<Contact[]> {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").trim();
  const base = raw.replace(/\/+$/, "").replace(/\/api$/i, "");
  try {
    const res = await fetch(`${base}/api/company-contacts`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Contact[] } | Contact[];
    return Array.isArray(body) ? body : body.data ?? [];
  } catch {
    return [];
  }
}

function whatsapp(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Je ne reçois pas le code SMS",
    a: "Vérifiez le numéro (+243…), attendez une minute puis touchez « Renvoyer le code ». Si vous avez déjà un PIN, utilisez « J'ai déjà un compte » et entrez votre PIN.",
  },
  {
    q: "J'ai oublié mon code PIN",
    a: "Sur l'écran du PIN, touchez « PIN oublié » : un code SMS vous permet d'en choisir un nouveau.",
  },
  {
    q: "Un paiement Mobile Money a échoué",
    a: "Vérifiez votre solde et réessayez. Si votre compte a été débité sans confirmation dans SENGA, contactez-nous avec la référence de la transaction.",
  },
  {
    q: "Comment supprimer mon compte ?",
    a: "Dans l'application : ouvrez votre profil (Compte et connexion) et touchez « Supprimer mon compte » en bas de l'écran.",
  },
];

export default async function SupportPage() {
  const contacts = await loadContacts();
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
        {" · "}
        <Link href="/account-deletion" className="hover:underline">
          Suppression de compte
        </Link>
      </p>

      <article className="space-y-8 text-[15px] leading-relaxed text-[var(--foreground)]">
        <header className="space-y-2 border-b border-black/10 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Support SENGA</h1>
          <p className="text-black/70">
            Une question sur une course, une livraison, un paiement ou votre compte ? Notre équipe
            vous répond.
          </p>
          <p className="text-sm text-black/60">
            SENGA support — questions about rides, deliveries, payments or your account (SENGA
            and SENGA Driver apps, DR Congo).
          </p>
        </header>

        <section className="space-y-4" aria-labelledby="contact">
          <h2 id="contact" className="text-xl font-semibold">
            Nous contacter · Contact us
          </h2>
          {contacts.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={c.id} className="rounded-xl border border-black/10 p-4">
                  <p className="font-medium">{c.name}</p>
                  {(c.title || c.department) && (
                    <p className="text-sm text-black/60">
                      {[c.title, c.department].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-2 space-y-1 text-sm">
                    {c.phone && (
                      <p>
                        <a className="text-[var(--mova-violet)] underline" href={`tel:${c.phone}`}>
                          {c.phone}
                        </a>
                        {" · "}
                        <a className="text-[var(--mova-violet)] underline" href={whatsapp(c.phone)}>
                          WhatsApp
                        </a>
                      </p>
                    )}
                    {c.email && (
                      <p>
                        <a className="text-[var(--mova-violet)] underline" href={`mailto:${c.email}`}>
                          {c.email}
                        </a>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Dans l&apos;application SENGA, ouvrez <strong>Aide → Contacter le support</strong> pour
              joindre l&apos;équipe par téléphone, WhatsApp ou e-mail.
            </p>
          )}
          <p className="text-sm text-black/60">
            Dans l&apos;application : <strong>Aide → Contacter le support</strong>. In the app:{" "}
            <strong>Help → Contact support</strong>.
          </p>
        </section>

        <section className="space-y-4" aria-labelledby="faq">
          <h2 id="faq" className="text-xl font-semibold">
            Questions fréquentes
          </h2>
          <dl className="space-y-4">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="font-medium">{f.q}</dt>
                <dd className="text-black/75">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </main>
  );
}
