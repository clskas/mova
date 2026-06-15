"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, cancelScheduledRide, formatCdf, formatDate, type ScheduledOverview } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui";

export default function PlanifieesPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("planifiees");
  const [scheduled, setScheduled] = useState<ScheduledOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScheduledOverview | null>(null);
  const [selected, setSelected] = useState<ScheduledOverview | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ScheduledOverview[]>("/api/admin/scheduled-rides");
      setScheduled(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function doCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await cancelScheduledRide(cancelTarget.id, "Annulé par administrateur");
      setCancelTarget(null);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'annulation");
    } finally {
      setSaving(false);
    }
  }

  const canCancel = (s?: string) => s && !["COMPLETED", "CANCELLED"].includes(s);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Courses planifiées" subtitle="Réservations à l'avance" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : scheduled.length === 0 ? (
        <EmptyState message="Aucune course planifiée" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Trajet</th>
                <th className="p-3">Date prévue</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Prix</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((s) => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{s.pickupAddress ?? "—"} → {s.dropoffAddress ?? "—"}</td>
                  <td className="p-3 text-gray-500">{formatDate(s.scheduledAt)}</td>
                  <td className="p-3"><StatusBadge status={s.status} /></td>
                  <td className="p-3 text-[#6C63FF]">{formatCdf(s.priceCdf)}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => setSelected(s)} className="text-[#6C63FF] hover:underline">Détail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail réservation">
        {selected && (
          <div className="space-y-3 text-sm">
            <p><span className="text-gray-500">ID:</span> {selected.id}</p>
            <p><span className="text-gray-500">Passager:</span> {selected.passengerId}</p>
            <p><span className="text-gray-500">Départ:</span> {selected.pickupAddress}</p>
            <p><span className="text-gray-500">Arrivée:</span> {selected.dropoffAddress}</p>
            <p><span className="text-gray-500">Date:</span> {formatDate(selected.scheduledAt)}</p>
            <p><span className="text-gray-500">Statut:</span> <StatusBadge status={selected.status} /></p>
            <p><span className="text-gray-500">Prix:</span> {formatCdf(selected.priceCdf)}</p>
            {canCancel(selected.status) && !readOnly && (
              <BtnDanger onClick={() => setCancelTarget(selected)}>Annuler la réservation</BtnDanger>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
        title="Annuler la réservation"
        message="Confirmer l'annulation de cette course planifiée ?"
        confirmLabel="Annuler"
        danger
        loading={saving}
      />
    </div>
  );
}
