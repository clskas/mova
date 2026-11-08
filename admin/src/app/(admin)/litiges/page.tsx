"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  acknowledgeIncident,
  addIncidentNote,
  apiFetch,
  decideCashDispute,
  draftSupportReply,
  formatDate,
  INCIDENT_OUTCOME_OPTIONS,
  resolveIncident,
  sosTrailMapsUrl,
  type Incident,
} from "@/lib/api";
import { SosIncidentMap, SosIncidentMapPlaceholder, googleMapsUrl } from "@/components/SosIncidentMap";
import { useAdmin } from "@/components/AdminProvider";
import { createdAtInRange, rangeForPresetDays } from "@/lib/period-filter";
import {
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  SearchInput,
  StatusBadge,
} from "@/components/ui";

const TYPE_FILTERS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "Tous" },
  { id: "SOS", label: "SOS" },
  { id: "CASH_NOT_RECEIVED", label: "Espèces non reçues" },
  { id: "FRAUD", label: "Fraude" },
  { id: "ACCIDENT", label: "Accident" },
  { id: "HARASSMENT", label: "Harcèlement" },
  { id: "OTHER", label: "Autre" },
];

const TYPE_LABELS: Record<string, string> = {
  SOS: "Alerte SOS",
  CASH_NOT_RECEIVED: "Litige espèces non reçues",
  FRAUD: "Litige fraude",
  ACCIDENT: "Litige accident",
  HARASSMENT: "Litige harcèlement",
  OTHER: "Autre réclamation",
};

const STATUS_FILTERS = [
  { id: "OPEN", label: "Ouverts" },
  { id: "CLOSED", label: "Clôturés" },
  { id: "ALL", label: "Tous statuts" },
];

const PERIODS: Array<{ id: number; label: string }> = [
  { id: 0, label: "Toutes dates" },
  { id: 7, label: "7 jours" },
  { id: 30, label: "30 jours" },
  { id: 90, label: "90 jours" },
];

/** Refresh so a new SOS / dispute appears without reloading the page. */
const REFRESH_MS = 30_000;

/** Who is who on a dispute card (labels depend on the kind of dispute). */
function parties(i: Incident): { reporterLabel: string; otherLabel: string; reporterId?: string | null; otherId?: string | null; reporterName?: string | null; reporterPhone?: string | null; otherName?: string | null; otherPhone?: string | null } {
  const reporter = { id: i.userId, name: i.userName, phone: i.userPhone };
  const other = { id: i.counterpartyUserId, name: i.counterpartyName, phone: i.counterpartyPhone };
  if (i.type === "CASH_NOT_RECEIVED") {
    // Older cash disputes were stored with the customer first.
    const legacy = (i.description ?? "").startsWith("Litige espèces");
    const driver = legacy ? other : reporter;
    const customer = legacy ? reporter : other;
    return {
      reporterLabel: "Signalé par (chauffeur / livreur)",
      otherLabel: "Client concerné",
      reporterId: driver.id,
      reporterName: driver.name,
      reporterPhone: driver.phone,
      otherId: customer.id,
      otherName: customer.name,
      otherPhone: customer.phone,
    };
  }
  if (i.referenceType === "FRAUD_AUTO") {
    return {
      reporterLabel: "Personne suspectée (n’est pas prévenue)",
      otherLabel: "Autre partie",
      reporterId: reporter.id,
      reporterName: reporter.name,
      reporterPhone: reporter.phone,
    };
  }
  return {
    reporterLabel: "Signalé par",
    otherLabel: "Autre partie (chauffeur / livreur)",
    reporterId: reporter.id,
    reporterName: reporter.name,
    reporterPhone: reporter.phone,
    otherId: other.id,
    otherName: other.name,
    otherPhone: other.phone,
  };
}

function referenceHref(i: Incident): string | null {
  const t = String(i.referenceType ?? "").toUpperCase();
  if (t === "DELIVERY" || t === "ERRAND") return i.referenceId ? `/livraisons?id=${encodeURIComponent(i.referenceId)}` : null;
  const rideId = i.rideId ?? (t === "RIDE" ? i.referenceId : null);
  return rideId ? `/courses?id=${encodeURIComponent(rideId)}` : null;
}

function PersonLine({ label, id, name, phone }: { label: string; id?: string | null; name?: string | null; phone?: string | null }) {
  if (!id) return null;
  return (
    <p className="text-xs text-gray-700 mt-1 flex flex-wrap items-center gap-x-2">
      <span className="text-gray-500">{label} :</span>
      <span className="font-medium">{name || "Nom inconnu"}</span>
      {phone && (
        <a href={`tel:${phone}`} className="text-[#6C63FF] hover:underline">
          📞 {phone}
        </a>
      )}
      <Link href={`/utilisateurs?focus=${encodeURIComponent(id)}`} className="text-[#6C63FF] hover:underline">
        Fiche ↗
      </Link>
    </p>
  );
}

function statusLabel(status?: string) {
  if (status === "DISMISSED") return "Classé";
  return status;
}

export default function LitigesPage() {
  const { canWrite } = useAdmin();
  const writable = canWrite("litiges");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [periodDays, setPeriodDays] = useState(0);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Incident[]>("/api/admin/incidents");
      setIncidents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function acknowledge(id: string) {
    try {
      await acknowledgeIncident(id);
      void load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la prise en charge");
    }
  }

  const period = useMemo(() => (periodDays > 0 ? rangeForPresetDays(periodDays) : null), [periodDays]);
  const q = search.trim().toLowerCase();

  const visible = incidents.filter((i) => {
    const status = i.status ?? "OPEN";
    if (statusFilter === "OPEN" && status !== "OPEN") return false;
    if (statusFilter === "CLOSED" && status === "OPEN") return false;
    if (typeFilter === "SOS" && !(i.type === "SOS" || i.isEmergency === true)) return false;
    if (typeFilter !== "ALL" && typeFilter !== "SOS" && i.type !== typeFilter) return false;
    if (period && !createdAtInRange(i.createdAt, period.from, period.to)) return false;
    if (!q) return true;
    const hay = [
      i.id,
      i.description,
      i.userId,
      i.userName,
      i.userPhone,
      i.counterpartyUserId,
      i.counterpartyName,
      i.counterpartyPhone,
      i.rideId,
      i.referenceId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  const openCount = incidents.filter((i) => (i.status ?? "OPEN") === "OPEN").length;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Litiges"
        subtitle={`Incidents et réclamations — ${openCount} ouvert(s) · mise à jour automatique toutes les 30 s`}
      />
      <div className="flex flex-wrap gap-2 mb-3">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTypeFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              typeFilter === f.id ? "bg-[#6C63FF] text-white border-[#6C63FF]" : "bg-white text-gray-700 border-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs border ${
              statusFilter === f.id ? "bg-[#1A1A2E] text-white border-[#1A1A2E]" : "bg-white border-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px bg-gray-200 mx-1" />
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriodDays(p.id)}
            className={`px-3 py-1 rounded-full text-xs border ${
              periodDays === p.id ? "bg-[#1A1A2E] text-white border-[#1A1A2E]" : "bg-white border-gray-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Rechercher : nom, téléphone, n° de course, texte…"
        className="mb-4"
      />
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <EmptyState message="Aucun litige pour ce filtre" />
      ) : (
        <div className="space-y-3">
          {visible.map((i) => {
            const hasGps = i.lat != null && i.lng != null;
            const isSos = i.type === "SOS" || i.isEmergency;
            const isCash = i.type === "CASH_NOT_RECEIVED";
            const isFraud = i.referenceType === "FRAUD_AUTO";
            const label = TYPE_LABELS[i.type ?? ""] ?? i.type ?? "Litige";
            const who = parties(i);
            const refHref = referenceHref(i);
            const open = (i.status ?? "OPEN") === "OPEN";
            return (
              <Card key={i.id} className="p-4 flex flex-wrap justify-between gap-4">
                <div className="flex-1 min-w-[260px]">
                  <p className="font-medium flex items-center gap-2">
                    {isSos ? <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">SOS</span> : null}
                    {isCash ? <span className="px-2 py-0.5 rounded bg-orange-500 text-white text-xs font-bold">ESPÈCES</span> : null}
                    {label}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{i.description}</p>
                  <PersonLine label={who.reporterLabel} id={who.reporterId} name={who.reporterName} phone={who.reporterPhone} />
                  <PersonLine label={who.otherLabel} id={who.otherId} name={who.otherName} phone={who.otherPhone} />
                  {refHref && (
                    <p className="text-xs mt-1">
                      <Link href={refHref} className="text-[#6C63FF] hover:underline">
                        {String(i.referenceType ?? "").toUpperCase() === "DELIVERY" || String(i.referenceType ?? "").toUpperCase() === "ERRAND"
                          ? "Ouvrir la livraison ↗"
                          : "Ouvrir la course ↗"}
                      </Link>
                    </p>
                  )}
                  {hasGps && (
                    <a
                      href={googleMapsUrl(i.lat!, i.lng!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#6C63FF] hover:underline mt-2"
                    >
                      GPS {i.lat?.toFixed(5)}, {i.lng?.toFixed(5)} — Ouvrir dans Google Maps ↗
                    </a>
                  )}
                  <div className="flex gap-2 mt-2 items-center flex-wrap">
                    <StatusBadge status={i.status} label={statusLabel(i.status)} />
                    <span className="text-xs text-gray-400">{formatDate(i.createdAt)}</span>
                    {i.acknowledgedAt ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                        Pris en charge par {i.acknowledgedByName ?? "l’équipe"} · {formatDate(i.acknowledgedAt)}
                      </span>
                    ) : open ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                        Personne ne l’a encore pris en charge
                        {i.escalatedAt ? " — relance envoyée" : ""}
                      </span>
                    ) : null}
                  </div>
                  {isSos && (i.trail?.length ?? 0) > 1 && (
                    <p className="text-xs text-gray-600 mt-2">
                      Suivi en direct : {i.trail!.length} positions
                      {i.lastLocationAt ? ` · dernière ${formatDate(i.lastLocationAt)}` : ""} ·{" "}
                      <a href={sosTrailMapsUrl(i.trail!) ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[#6C63FF] hover:underline">
                        Voir le trajet ↗
                      </a>
                    </p>
                  )}
                  <IncidentNotes incident={i} canWrite={writable} onSaved={() => void load(true)} />
                  {writable && (
                    <ClosePanel
                      incident={i}
                      isCash={isCash}
                      isFraud={isFraud}
                      onDone={() => void load(true)}
                      onError={setError}
                    />
                  )}
                </div>
                {isSos && (
                  <div className="w-full sm:w-72 shrink-0">
                    {hasGps ? <SosIncidentMap lat={i.lat!} lng={i.lng!} label="Alerte SOS" /> : <SosIncidentMapPlaceholder />}
                  </div>
                )}
                {open && writable && !i.acknowledgedAt && (
                  <div className="flex flex-col gap-2">
                    <BtnPrimary onClick={() => acknowledge(i.id)}>Je prends en charge</BtnPrimary>
                  </div>
                )}
                {!isSos && !isFraud && i.description && <ReplyDraft incident={i} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Closing a dispute: an outcome (told to the reporter) and an optional comment.
 * Cash dispute: « Le client a payé » confirms the payment; « n’a pas payé » keeps it due.
 * A closed dispute can be reopened.
 */
function ClosePanel({
  incident,
  isCash,
  isFraud,
  onDone,
  onError,
}: {
  incident: Incident;
  isCash: boolean;
  isFraud: boolean;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const open = (incident.status ?? "OPEN") === "OPEN";
  const [outcome, setOutcome] = useState(isFraud ? "SANCTIONED" : "RESOLVED");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setComment("");
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => resolveIncident(incident.id, "OPEN"))}
          className="text-xs rounded-lg border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          Rouvrir le litige
        </button>
      </div>
    );
  }

  const outcomes = isFraud
    ? [...INCIDENT_OUTCOME_OPTIONS.filter((o) => o.value !== "REFUNDED"), { value: "FALSE_POSITIVE", label: "Faux positif" }]
    : INCIDENT_OUTCOME_OPTIONS;

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-medium text-gray-700">Clôturer ce litige</p>
      <input
        className="w-full rounded-lg border px-2 py-1 text-xs"
        placeholder="Commentaire (facultatif) — visible dans le suivi"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {isCash ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Confirmer que le client a payé ? Le paiement sera validé et le chauffeur payé normalement.")) return;
              void run(() => decideCashDispute(incident.id, "CUSTOMER_PAID", comment));
            }}
            className="text-xs rounded-lg bg-emerald-600 text-white px-3 py-1.5 disabled:opacity-50"
          >
            Le client a payé
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => decideCashDispute(incident.id, "CUSTOMER_DID_NOT_PAY", comment))}
            className="text-xs rounded-lg bg-orange-500 text-white px-3 py-1.5 disabled:opacity-50"
          >
            Le client n’a pas payé
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => decideCashDispute(incident.id, "NO_ACTION", comment))}
            className="text-xs rounded-lg border px-3 py-1.5 hover:bg-white disabled:opacity-50"
          >
            Sans suite
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          <select className="rounded-lg border px-2 py-1 text-xs" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {outcomes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => resolveIncident(incident.id, "RESOLVED", { outcome, comment }))}
            className="text-xs rounded-lg bg-[#6C63FF] text-white px-3 py-1.5 disabled:opacity-50"
          >
            Clôturer
          </button>
        </div>
      )}
      {isCash && (
        <p className="text-[11px] text-gray-500">
          « N’a pas payé » : la somme reste due, le client devra la régler avant sa prochaine commande.
        </p>
      )}
    </div>
  );
}

/** Suivi interne : qui a fait quoi (prise en charge, appels, résolution). */
function IncidentNotes({ incident, canWrite, onSaved }: { incident: Incident; canWrite: boolean; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const notes = incident.notes ?? [];
  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addIncidentNote(incident.id, text.trim());
      setText("");
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 space-y-1">
      {notes.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-0.5">
          {notes.slice(-6).map((n, idx) => (
            <li key={idx}>
              <span className="text-gray-400">{formatDate(n.at)}</span> · <b>{n.by}</b> : {n.text}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (incident.status ?? "OPEN") === "OPEN" && (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border px-2 py-1 text-xs"
            placeholder="Ajouter une note (ex. appelé le passager, police prévenue)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !text.trim()}
            className="text-xs rounded-lg border px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

/** « Brouillon de réponse (IA) » : texte proposé, à relire puis copier dans le canal de réponse. */
function ReplyDraft({ incident }: { incident: Incident }) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setNote(null);
    try {
      const res = await draftSupportReply({
        kind: "Litige",
        subject: incident.type ?? "",
        message: incident.description ?? "",
      });
      if (res.available && res.reply) {
        setDraft(res.reply);
        setNote(res.internalNote ?? null);
      } else {
        setNote(res.message ?? "Brouillon indisponible pour le moment.");
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Brouillon impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="text-xs rounded-lg border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? "Rédaction…" : draft ? "Proposer une autre réponse (IA)" : "Brouillon de réponse (IA)"}
      </button>
      {draft != null && (
        <div className="space-y-1">
          <textarea className="w-full rounded-xl border p-2 text-sm" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button
            type="button"
            className="text-xs text-[#6C63FF] hover:underline"
            onClick={() => {
              void navigator.clipboard?.writeText(draft).then(() => setCopied(true));
            }}
          >
            {copied ? "Copié ✓" : "Copier la réponse"}
          </button>
        </div>
      )}
      {note && <p className="text-xs text-gray-500">{note}</p>}
    </div>
  );
}
