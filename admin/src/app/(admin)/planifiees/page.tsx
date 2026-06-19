"use client";

import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  assignScheduledDriver,
  cancelScheduledRide,
  fetchDriversForAssignment,
  formatCdf,
  formatDate,
  updateScheduledRideStatus,
  type AdminDriver,
  type ScheduledOverview,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { AssignDriverSelect } from "@/components/AssignDriverSelect";
import { ContactBlock } from "@/components/ContactActions";
import {
  BtnDanger,
  BtnPrimary,
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
} from "@/components/ui";

const SCHEDULED_STATUSES = [
  { value: "SCHEDULED", label: "Planifiée" },
  { value: "CONFIRMED", label: "Confirmée" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "COMPLETED", label: "Terminée" },
  { value: "CANCELLED", label: "Annulée" },
];

export default function PlanifieesPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("planifiees");
  const [scheduled, setScheduled] = useState<ScheduledOverview[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScheduledOverview | null>(null);
  const [selected, setSelected] = useState<ScheduledOverview | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, driverList] = await Promise.all([
        apiFetch<ScheduledOverview[]>("/api/admin/scheduled-rides"),
        fetchDriversForAssignment(),
      ]);
      setScheduled(Array.isArray(data) ? data : []);
      setDrivers(driverList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDetail(s: ScheduledOverview) {
    setSelected(s);
    setNewStatus(s.status ?? "SCHEDULED");
    setAssignDriverId(s.driverId ?? "");
  }

  async function saveStatus() {
    if (!selected || !newStatus || newStatus === selected.status) return;
    setSaving(true);
    setError(null);
    try {
      await updateScheduledRideStatus(selected.id, newStatus);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la mise à jour du statut");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!selected || !assignDriverId || assignDriverId === (selected.driverId ?? "")) return;
    setSaving(true);
    setError(null);
    try {
      await assignScheduledDriver(selected.id, assignDriverId);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'assignation");
    } finally {
      setSaving(false);
    }
  }

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
      <PageHeader title="Courses planifiées" subtitle="Réservations à l'avance — contact passager/chauffeur et assignation" />
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
                <th className="p-3">Passager</th>
                <th className="p-3">Chauffeur</th>
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
                  <td className="p-3 text-gray-600">{s.passengerName ?? s.passengerPhone ?? "—"}</td>
                  <td className="p-3 text-gray-600">{s.driverName ?? (s.driverId ? "Assigné" : "—")}</td>
                  <td className="p-3"><StatusBadge status={s.status} /></td>
                  <td className="p-3 text-[#6C63FF]">{formatCdf(s.priceCdf)}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => openDetail(s)} className="text-[#6C63FF] hover:underline">Détail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail réservation" wide>
        {selected && (
          <div className="space-y-4 text-sm">
            <p><span className="text-gray-500">Trajet:</span> {selected.pickupAddress} → {selected.dropoffAddress}</p>
            <p><span className="text-gray-500">Date:</span> {formatDate(selected.scheduledAt)}</p>
            <p><span className="text-gray-500">Véhicule:</span> {selected.vehicleType ?? "—"}</p>
            <p><span className="text-gray-500">Prix:</span> {formatCdf(selected.priceCdf)}</p>
            <p><span className="text-gray-500">Statut:</span> <StatusBadge status={selected.status} /></p>

            <ContactBlock title="Passager" name={selected.passengerName} phone={selected.passengerPhone} />
            <ContactBlock title="Chauffeur assigné" name={selected.driverName} phone={selected.driverPhone} />

            {!readOnly && (
              <>
                <AssignDriverSelect
                  drivers={drivers}
                  value={assignDriverId}
                  onChange={setAssignDriverId}
                  disabled={saving}
                />
                <BtnPrimary
                  onClick={saveAssignment}
                  disabled={saving || !assignDriverId || assignDriverId === (selected.driverId ?? "")}
                >
                  {saving ? "Enregistrement…" : "Assigner le chauffeur"}
                </BtnPrimary>

                <FieldLabel>Modifier le statut</FieldLabel>
                <SelectInput value={newStatus} onChange={setNewStatus} options={SCHEDULED_STATUSES} />
                <BtnPrimary onClick={saveStatus} disabled={saving || newStatus === selected.status}>
                  {saving ? "Enregistrement…" : "Enregistrer le statut"}
                </BtnPrimary>
              </>
            )}
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
