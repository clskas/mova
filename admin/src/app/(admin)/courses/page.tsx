"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, cancelRide, formatCdf, formatDate, type RideOverview } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  Modal,
  PageHeader,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@/components/ui";

const STATUSES = [
  { value: "", label: "Tous les statuts" },
  { value: "REQUESTED", label: "Demandée" },
  { value: "SEARCHING", label: "Recherche" },
  { value: "ACCEPTED", label: "Acceptée" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "COMPLETED", label: "Terminée" },
  { value: "CANCELLED", label: "Annulée" },
];

export default function CoursesPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("courses");
  const [rides, setRides] = useState<RideOverview[]>([]);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RideOverview | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RideOverview | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const data = await apiFetch<RideOverview[]>(`/api/admin/rides?${params}`);
      setRides(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  async function doCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await cancelRide(cancelTarget.id, "Annulé par administrateur");
      setCancelTarget(null);
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'annulation");
    } finally {
      setSaving(false);
    }
  }

  const canCancel = (s?: string) => s && !["COMPLETED", "CANCELLED"].includes(s);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Courses taxi" subtitle="Liste et gestion des courses en temps réel" />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="w-44">
          <FieldLabel>Statut</FieldLabel>
          <SelectInput value={status} onChange={setStatus} options={STATUSES} />
        </div>
        <div className="w-40">
          <FieldLabel>Du</FieldLabel>
          <TextInput type="date" value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="w-40">
          <FieldLabel>Au</FieldLabel>
          <TextInput type="date" value={dateTo} onChange={setDateTo} />
        </div>
      </div>
      {loading ? (
        <LoadingState />
      ) : rides.length === 0 ? (
        <EmptyState message="Aucune course trouvée" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Trajet</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Véhicule</th>
                <th className="p-3">Prix</th>
                <th className="p-3">Date</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{r.pickupAddress ?? "—"} → {r.dropoffAddress ?? "—"}</td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
                  <td className="p-3">{r.vehicleType ?? "—"}</td>
                  <td className="p-3 text-[#6C63FF]">{formatCdf(r.priceCdf)}</td>
                  <td className="p-3 text-gray-500">{formatDate(r.createdAt)}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => setSelected(r)} className="text-[#6C63FF] hover:underline">Détail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail course" wide>
        {selected && (
          <div className="space-y-3 text-sm">
            <p><span className="text-gray-500">ID:</span> {selected.id}</p>
            <p><span className="text-gray-500">Passager:</span> {selected.passengerId}</p>
            <p><span className="text-gray-500">Chauffeur:</span> {selected.driverId ?? "Non assigné"}</p>
            <p><span className="text-gray-500">Statut:</span> <StatusBadge status={selected.status} /></p>
            <p><span className="text-gray-500">Départ:</span> {selected.pickupAddress}</p>
            <p><span className="text-gray-500">Arrivée:</span> {selected.dropoffAddress}</p>
            <p><span className="text-gray-500">Prix:</span> {formatCdf(selected.priceCdf)}</p>
            {canCancel(selected.status) && !readOnly && (
              <BtnDanger onClick={() => setCancelTarget(selected)}>Annuler la course</BtnDanger>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
        title="Annuler la course"
        message="Cette action est irréversible. Confirmer l'annulation ?"
        confirmLabel="Annuler la course"
        danger
        loading={saving}
      />
    </div>
  );
}
