"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

type Vendor = { id?: string; name?: string; nextPaymentAt?: string | null; expiresAt?: string | null; amountUsd?: number | null; billingCycle?: string | null };
type Platform = {
  key: string;
  name: string;
  category: string;
  usedFor: string;
  consoleUrl: string;
  status: "configured" | "missing" | "partial" | "external" | "unused";
  missing: string[];
  adminControls?: { label: string; href: string }[];
  optional?: boolean;
  vendors: Vendor[];
};
type Payload = { services: { service: string; reachable: boolean }[]; platforms: Platform[] };

const CATEGORIES: Record<string, string> = {
  hosting: "Hébergement, données et code",
  stores: "Stores d'applications",
  payments: "Paiements",
  messaging: "Notifications, SMS et e-mails",
  maps: "Cartes et itinéraires",
  ai: "Intelligence artificielle",
  identity: "Identité et connexion",
  monitoring: "Suivi des erreurs",
};

const STATUS: Record<Platform["status"], { label: string; cls: string }> = {
  configured: { label: "Configurée", cls: "bg-emerald-100 text-emerald-800" },
  partial: { label: "Incomplète", cls: "bg-amber-100 text-amber-800" },
  missing: { label: "Non configurée", cls: "bg-red-100 text-red-800" },
  unused: { label: "Non utilisée (facultative)", cls: "bg-slate-100 text-slate-600" },
  external: { label: "Gérée chez le fournisseur", cls: "bg-violet-100 text-violet-800" },
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : null);

/** Every external platform SENGA uses: status on the servers, where to control it, billing dates. */
export default function PlateformesPage() {
  const { role } = useAdmin();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Payload>("/api/admin/external-platforms"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, []);
  useEffect(() => {
    if (role === "SUPER_ADMIN") void load();
  }, [load, role]);

  if (role !== "SUPER_ADMIN") {
    return (
      <div className="p-4">
        <PageHeader title="Plateformes externes" subtitle="Réservé au super administrateur." />
      </div>
    );
  }
  if (!data) return error ? <ErrorBanner message={error} /> : <LoadingState />;

  const problems = data.platforms.filter((p) => p.status === "missing" || p.status === "partial");
  const unreachable = data.services.filter((s) => !s.reachable);

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      <PageHeader
        title="Plateformes externes"
        subtitle="Tous les services extérieurs utilisés par SENGA : état sur les serveurs (sans jamais afficher les clés), où les contrôler, échéances de paiement."
      />
      {error && <ErrorBanner message={error} />}
      <Card className="p-4 text-sm space-y-1">
        <p>
          <strong>{data.platforms.length}</strong> plateformes ·{" "}
          <span className="text-emerald-700">{data.platforms.filter((p) => p.status === "configured").length} configurées</span> ·{" "}
          <span className={problems.length ? "text-red-700 font-semibold" : "text-slate-600"}>{problems.length} à vérifier</span>
        </p>
        {unreachable.length > 0 && (
          <p className="text-amber-700">
            Services qui n&apos;ont pas répondu (état peut-être incomplet) : {unreachable.map((s) => s.service).join(", ")}.
          </p>
        )}
        <p className="text-slate-500">
          Les clés se modifient chez le fournisseur ou dans les variables d&apos;environnement de Render. Les échéances se
          gèrent dans <a className="text-violet-700 underline" href="/abonnements-externes">Hébergements &amp; plateformes</a>.
        </p>
      </Card>

      {Object.entries(CATEGORIES).map(([cat, title]) => {
        const list = data.platforms.filter((p) => p.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat} className="space-y-3">
            <h2 className="font-semibold text-[#1A1A2E]">{title}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {list.map((p) => (
                <Card key={p.key} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{p.name}</p>
                    <span className={`text-xs rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                  </div>
                  <p className="text-sm text-slate-600">{p.usedFor}</p>
                  {p.missing.length > 0 && (
                    <p className="text-xs text-red-700">Variable(s) manquante(s) sur Render : {p.missing.join(", ")}</p>
                  )}
                  {p.vendors.map((v, i) => (
                    <p key={v.id ?? i} className="text-xs text-slate-500">
                      Échéance : {fmtDate(v.nextPaymentAt) ?? fmtDate(v.expiresAt) ?? "non renseignée"}
                      {v.amountUsd != null ? ` · ${v.amountUsd} $ ${v.billingCycle ?? ""}` : ""}
                    </p>
                  ))}
                  <div className="flex flex-wrap gap-3 text-sm pt-1">
                    <a className="text-violet-700 underline" href={p.consoleUrl} target="_blank" rel="noreferrer noopener">
                      Console du fournisseur
                    </a>
                    {(p.adminControls ?? []).map((c) => (
                      <a key={c.href + c.label} className="text-slate-700 underline" href={c.href}>
                        {c.label}
                      </a>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
