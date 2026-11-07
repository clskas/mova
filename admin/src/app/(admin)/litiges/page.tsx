"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeIncident,
  addIncidentNote,
  apiFetch,
  draftSupportReply,
  formatDate,
  resolveIncident,
  sosTrailMapsUrl,
  type Incident,
} from "@/lib/api";
import { SosIncidentMap, SosIncidentMapPlaceholder, googleMapsUrl } from "@/components/SosIncidentMap";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
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

export default function LitigesPage() {
  const { canWrite } = useAdmin();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("OPEN");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Incident[]>("/api/admin/incidents");
      setIncidents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acknowledge(id: string) {
    try {
      await acknowledgeIncident(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la prise en charge");
    }
  }

  async function resolve(id: string) {
    try {
      await resolveIncident(id, "RESOLVED");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec résolution");
    }
  }

  const visible = incidents.filter((i) => {
    if (statusFilter !== "ALL" && (i.status ?? "OPEN") !== statusFilter) return false;
    if (typeFilter === "ALL") return true;
    if (typeFilter === "SOS") return i.type === "SOS" || i.isEmergency === true;
    return i.type === typeFilter;
  });

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Litiges" subtitle="Incidents et réclamations — filtrés par type" />
      <div className="flex flex-wrap gap-2 mb-3">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTypeFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              typeFilter === f.id
                ? "bg-[#6C63FF] text-white border-[#6C63FF]"
                : "bg-white text-gray-700 border-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        {[
          { id: "OPEN", label: "Ouverts" },
          { id: "RESOLVED", label: "Résolus" },
          { id: "ALL", label: "Tous statuts" },
        ].map((f) => (
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
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
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
            const label = TYPE_LABELS[i.type ?? ""] ?? i.type ?? "Litige";
            return (
              <Card key={i.id} className="p-4 flex flex-wrap justify-between gap-4">
                <div className="flex-1 min-w-[260px]">
                  <p className="font-medium flex items-center gap-2">
                    {isSos ? (
                      <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">SOS</span>
                    ) : null}
                    {isCash ? (
                      <span className="px-2 py-0.5 rounded bg-orange-500 text-white text-xs font-bold">ESPÈCES</span>
                    ) : null}
                    {label}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">{i.description}</p>
                  {i.userId && (
                    <p className="text-xs text-gray-700 mt-1">Passager / signalé par : {i.userId}</p>
                  )}
                  {i.counterpartyUserId && (
                    <p className="text-xs text-gray-700 mt-1">Chauffeur / livreur : {i.counterpartyUserId}</p>
                  )}
                  {i.rideId && <p className="text-xs text-gray-500 mt-1">Course : {i.rideId}</p>}
                  {i.referenceType && i.referenceId && (
                    <p className="text-xs text-gray-500 mt-1">
                      Référence : {i.referenceType} {i.referenceId}
                    </p>
                  )}
                  {hasGps && (
                    <p className="text-xs text-gray-500 mt-1">
                      GPS : {i.lat?.toFixed(5)}, {i.lng?.toFixed(5)}
                    </p>
                  )}
                  {hasGps && (
                    <a
                      href={googleMapsUrl(i.lat!, i.lng!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#6C63FF] hover:underline mt-2"
                    >
                      Ouvrir dans Google Maps ↗
                    </a>
                  )}
                  <div className="flex gap-2 mt-2 items-center flex-wrap">
                    <StatusBadge status={i.status} />
                    <span className="text-xs text-gray-400">{formatDate(i.createdAt)}</span>
                    {i.acknowledgedAt ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                        Pris en charge par {i.acknowledgedByName ?? "l’équipe"} · {formatDate(i.acknowledgedAt)}
                      </span>
                    ) : i.status === "OPEN" ? (
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
                      <a
                        href={sosTrailMapsUrl(i.trail!) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#6C63FF] hover:underline"
                      >
                        Voir le trajet ↗
                      </a>
                    </p>
                  )}
                  <IncidentNotes incident={i} canWrite={canWrite("litiges")} onSaved={load} />
                </div>
                {isSos && (
                  <div className="w-full sm:w-72 shrink-0">
                    {hasGps ? (
                      <SosIncidentMap lat={i.lat!} lng={i.lng!} label="Alerte SOS" />
                    ) : (
                      <SosIncidentMapPlaceholder />
                    )}
                  </div>
                )}
                {i.status === "OPEN" && canWrite("litiges") && (
                  <div className="flex flex-col gap-2">
                    {!i.acknowledgedAt && (
                      <BtnPrimary onClick={() => acknowledge(i.id)}>Je prends en charge</BtnPrimary>
                    )}
                    <BtnPrimary onClick={() => resolve(i.id)}>Résoudre</BtnPrimary>
                  </div>
                )}
                {!isSos && i.description && <ReplyDraft incident={i} />}
              </Card>
            );
          })}
        </div>
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
      {canWrite && incident.status === "OPEN" && (
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
          <textarea
            className="w-full rounded-xl border p-2 text-sm"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
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
