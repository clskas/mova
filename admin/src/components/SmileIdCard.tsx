"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createDriverSmileIdLink,
  getDriverSmileId,
  refreshDriverSmileId,
  type SmileIdState,
  type SmileIdVerification,
} from "@/lib/api";

const DOC_LABELS: Record<string, string> = {
  VOTER_ID: "Carte d'électeur",
  PASSPORT: "Passeport",
  DRIVERS_LICENSE: "Permis de conduire",
};

function statusView(v: SmileIdVerification) {
  switch (v.status) {
    case "clear":
      return { label: "✔ Identité vérifiée", style: "border-green-200 bg-green-50 text-green-900" };
    case "attention":
      return { label: "À vérifier de près", style: "border-amber-300 bg-amber-50 text-amber-900" };
    case "block":
      return { label: "⚠ Refusé par Smile ID", style: "border-red-300 bg-red-50 text-red-900" };
    case "error":
      return { label: "Erreur pendant la vérification", style: "border-red-300 bg-red-50 text-red-900" };
    case "processing":
      return { label: "Vérification en cours…", style: "border-blue-200 bg-blue-50 text-blue-900" };
    default:
      return { label: "Lien envoyé, pas encore utilisé", style: "border-gray-200 bg-gray-50 text-gray-800" };
  }
}

/** WhatsApp wants the number in international form without "+" (RDC: 243…). */
function whatsappNumber(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("243")) return digits;
  if (digits.startsWith("0")) return `243${digits.slice(1)}`;
  return digits;
}

/** Smile ID identity check in the driver file: create the link, send it, read the verdict. */
export function SmileIdCard({
  userId,
  canWrite,
  phone,
}: {
  userId: string;
  canWrite: boolean;
  phone?: string | null;
}) {
  const [state, setState] = useState<SmileIdState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getDriverSmileId(userId)
      .then(setState)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur de chargement Smile ID"));
  }, [userId]);

  useEffect(() => {
    setState(null);
    setCopied(false);
    load();
  }, [load]);

  const run = async (fn: () => Promise<SmileIdState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur Smile ID");
    } finally {
      setBusy(false);
    }
  };

  if (!state && !error) return <p className="text-xs text-gray-500">Smile ID : chargement…</p>;

  const v = state?.verification ?? null;
  const view = v ? statusView(v) : null;
  const wa = whatsappNumber(phone);
  const message = v
    ? `Bonjour, pour finaliser votre inscription chauffeur SENGA, merci de vérifier votre identité ici (carte d'électeur, passeport ou permis + selfie) : ${v.link}`
    : "";
  const id = v?.result?.idFields;
  const fraud = v?.result?.fraud;

  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm space-y-2" data-testid="smile-id-card">
      <p className="font-medium">
        Vérification d&apos;identité Smile ID
        {state?.env === "sandbox" && (
          <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">Test (Sandbox)</span>
        )}
      </p>
      {state && !state.configured && (
        <p className="text-xs text-gray-600">Smile ID n&apos;est pas encore configuré sur le serveur.</p>
      )}
      {v && view && (
        <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${view.style}`}>
          <p className="font-medium">{view.label}</p>
          {v.message && v.status !== "PENDING" && <p>{v.message}</p>}
          {id?.fullName && (
            <p>
              Lu sur le document : {id.fullName}
              {id.idType ? ` · ${DOC_LABELS[id.idType] ?? id.idType}` : ""}
              {id.idNumber ? ` · N° ${id.idNumber}` : ""}
              {id.expirationDate ? ` · expire le ${id.expirationDate}` : ""}
            </p>
          )}
          {fraud?.detected && <p>⚠ Fraude détectée{fraud.sources?.length ? ` (${fraud.sources.join(", ")})` : ""}.</p>}
          {fraud?.duplicateUsers && <p>⚠ {fraud.duplicateUsers}</p>}
          {v.result?.receiptUrl && (
            <a href={v.result.receiptUrl} target="_blank" rel="noreferrer" className="underline">
              Reçu de vérification (PDF)
            </a>
          )}
          <p className="opacity-70">Lien créé le {new Date(v.createdAt).toLocaleString("fr-FR")}</p>
        </div>
      )}
      {v && v.status === "PENDING" && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600">Envoyez ce lien au chauffeur : il l&apos;ouvre sur son téléphone, photographie sa pièce et prend un selfie.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => void navigator.clipboard?.writeText(v.link).then(() => setCopied(true))}
            >
              {copied ? "Lien copié ✔" : "Copier le lien"}
            </button>
            {wa && (
              <a
                className="rounded border border-green-600 px-2 py-1 text-xs text-green-700"
                href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
              >
                Envoyer par WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {canWrite && state?.configured && (
        <div className="flex flex-wrap gap-2">
          {!v && (
            <button
              type="button"
              disabled={busy}
              className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50"
              onClick={() => void run(() => createDriverSmileIdLink(userId))}
            >
              {busy ? "Création…" : "Créer le lien de vérification"}
            </button>
          )}
          {v && v.status !== "PENDING" && v.status !== "clear" && (
            <button
              type="button"
              disabled={busy}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
              onClick={() => void run(() => createDriverSmileIdLink(userId, true))}
            >
              Nouveau lien (refaire la vérification)
            </button>
          )}
          {v && (
            <button
              type="button"
              disabled={busy}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
              onClick={() => void run(() => refreshDriverSmileId(userId))}
            >
              Actualiser le résultat
            </button>
          )}
        </div>
      )}
    </div>
  );
}
