"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BtnPrimary, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

type Account = {
  id: string;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  creditLimitCdf: number;
  isActive: boolean;
  membersCount: number;
  owedCdf: number;
  monthRides: number;
  monthUsageCdf: number;
};
type Member = { id: string; userId: string; label?: string | null; isActive: boolean };
type Line = { rideId: string | null; label?: string | null; amountCdf: number; createdAt: string };

const cdf = (n: number) => `${Math.round(n).toLocaleString("fr-CD")} FC`;

/** Company accounts: members, credit limit, what is owed, monthly statement, settlements. */
export default function EntreprisesPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", contactName: "", contactPhone: "", creditLimitCdf: "500000" });
  const [phone, setPhone] = useState("");
  const [settle, setSettle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await apiFetch<Account[]>("/api/admin/corporate/accounts"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const openAccount = async (id: string) => {
    setOpen(id === open ? null : id);
    if (id === open) return;
    const [m, s] = await Promise.all([
      apiFetch<Member[]>(`/api/admin/corporate/accounts/${id}/members`),
      apiFetch<Line[]>(`/api/admin/corporate/accounts/${id}/statement`),
    ]);
    setMembers(m);
    setLines(s);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      if (open) {
        const id = open;
        setOpen(null);
        await openAccount(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  if (!accounts) return error ? <ErrorBanner message={error} /> : <LoadingState />;

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      <PageHeader
        title="Comptes entreprises"
        subtitle="Les membres choisissent « Payé par mon entreprise » ; l'entreprise règle SENGA sur relevé mensuel. Interrupteur : Automatisations."
      />
      {error && <ErrorBanner message={error} />}

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Nouvelle entreprise</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          {(["name", "contactName", "contactPhone", "creditLimitCdf"] as const).map((k) => (
            <input
              key={k}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder={{ name: "Nom", contactName: "Contact", contactPhone: "Téléphone", creditLimitCdf: "Plafond (FC)" }[k]}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          ))}
        </div>
        <BtnPrimary
          disabled={busy || !form.name.trim()}
          onClick={() =>
            void run(async () => {
              await apiFetch("/api/admin/corporate/accounts", {
                method: "POST",
                body: JSON.stringify({ ...form, creditLimitCdf: Number(form.creditLimitCdf) || 0 }),
              });
              setForm({ name: "", contactName: "", contactPhone: "", creditLimitCdf: "500000" });
            })
          }
        >
          Créer
        </BtnPrimary>
      </Card>

      {accounts.length === 0 && <p className="text-sm text-slate-600">Aucune entreprise pour le moment.</p>}
      {accounts.map((a) => (
        <Card key={a.id} className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                {a.name} {!a.isActive && <span className="text-xs text-red-600">(désactivée)</span>}
              </p>
              <p className="text-xs text-slate-500">
                {a.membersCount} membre(s) · ce mois : {a.monthRides} course(s), {cdf(a.monthUsageCdf)} · dû : {cdf(a.owedCdf)} / plafond {cdf(a.creditLimitCdf)}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="text-sm text-violet-700 underline" onClick={() => void openAccount(a.id)}>
                {open === a.id ? "Fermer" : "Détails"}
              </button>
              <button
                className="text-sm text-slate-600 underline"
                disabled={busy}
                onClick={() =>
                  void run(() => apiFetch(`/api/admin/corporate/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !a.isActive }) }))
                }
              >
                {a.isActive ? "Désactiver" : "Réactiver"}
              </button>
            </div>
          </div>
          {open === a.id && (
            <div className="space-y-4 border-t pt-3">
              <div>
                <p className="text-sm font-medium">Membres</p>
                <div className="flex gap-2 mt-1">
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    placeholder="Téléphone du membre (+243…)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <BtnPrimary
                    disabled={busy || !phone.trim()}
                    onClick={() =>
                      void run(async () => {
                        await apiFetch(`/api/admin/corporate/accounts/${a.id}/members`, { method: "POST", body: JSON.stringify({ phone }) });
                        setPhone("");
                      })
                    }
                  >
                    Ajouter
                  </BtnPrimary>
                </div>
                <ul className="mt-2 text-sm space-y-1">
                  {members.filter((m) => m.isActive).map((m) => (
                    <li key={m.id} className="flex items-center justify-between">
                      <span>{m.label ?? m.userId.slice(0, 8)}</span>
                      <button
                        className="text-xs text-red-600 underline"
                        disabled={busy}
                        onClick={() => void run(() => apiFetch(`/api/admin/corporate/members/${m.id}/remove`, { method: "POST", body: "{}" }))}
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">Enregistrer un règlement de l&apos;entreprise</p>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    className="rounded border border-slate-300 px-2 py-1 text-sm w-40"
                    placeholder="Montant (FC)"
                    value={settle}
                    onChange={(e) => setSettle(e.target.value)}
                  />
                  <BtnPrimary
                    disabled={busy || !(Number(settle) > 0)}
                    onClick={() => {
                      if (!window.confirm(`Enregistrer un règlement de ${cdf(Number(settle))} pour ${a.name} ?`)) return;
                      void run(async () => {
                        await apiFetch(`/api/admin/corporate/accounts/${a.id}/settle`, { method: "POST", body: JSON.stringify({ amountCdf: Number(settle) }) });
                        setSettle("");
                      });
                    }}
                  >
                    Enregistrer
                  </BtnPrimary>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Relevé du mois ({lines.length} course(s))</p>
                <table className="mt-1 w-full text-xs">
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1">{new Date(l.createdAt).toLocaleDateString("fr-FR")}</td>
                        <td>{l.label ?? "—"}</td>
                        <td>{l.rideId?.slice(0, 8) ?? "—"}</td>
                        <td className="text-right">{cdf(l.amountCdf)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
