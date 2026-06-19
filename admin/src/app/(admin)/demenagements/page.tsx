"use client";

import { useCallback, useEffect, useState } from "react";
import {
  assignMovingDriver,
  cancelMovingRequest,
  fetchDriversForAssignment,
  fetchMovingRequests,
  formatCdf,
  formatDate,
  updateMovingStatus,
  type AdminDriver,
  type MovingRequest,
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

const STATUSES = [
  { value: "PENDING", label: "En attente" },
  { value: "ASSIGNED", label: "Assigné" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "COMPLETED", label: "Terminé" },
  { value: "CANCELLED", label: "Annulé" },
];

export default function DemenagementsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("demenagements");
  const [rows, setRows] = useState<MovingRequest[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<MovingRequest | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [cancelTarget, setCancelTarget] = useState<MovingRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, driverList] = await Promise.all([
        fetchMovingRequests(),
        fetchDriversForAssignment(),
      ]);
      setRows(data);
      setDrivers(driverList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openDetail(r: MovingRequest) {
    setSelected(r);
    setNewStatus(r.status ?? "PENDING");
    setAssignDriverId(r.driverId ?? "");
  }

  async function saveStatus() {
    if (!selected || !newStatus || newStatus === selected.status) return;
    setSaving(true);
    try {
      await updateMovingStatus(selected.id, newStatus);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!selected || !assignDriverId || assignDriverId === (selected.driverId ?? "")) return;
    setSaving(true);
    try {
      await assignMovingDriver(selected.id, assignDriverId);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec assignation");
    } finally {
      setSaving(false);
    }
  }

  async function doCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await cancelMovingRequest(cancelTarget.id);
      setCancelTarget(null);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec annulation");
    } finally {
      setSaving(false);
    }
  }

  const canCancel = (s?: string) => s && !["COMPLETED", "CANCELLED"].includes(s);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Déménagements"
        subtitle="Contact passager/équipe et assignation chauffeur"
      />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucune demande de déménagement" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Trajet</th>
                <th className="p-3">Volume</th>
                <th className="p-3">Passager</th>
                <th className="p-3">Chauffeur</th>
                <th className="p-3">Prix est.</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Créée</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <p className="font-medium max-w-xs truncate">{r.pickupAddress ?? "—"}</p>
                    <p className="text-xs text-gray-500 max-w-xs truncate">→ {r.dropoffAddress ?? "—"}</p>
                  </td>
                  <td className="p-3 text-gray-600">{r.volumeM3 != null ? `${r.volumeM3} m³` : "—"}</td>
                  <td className="p-3 text-gray-600">{r.passengerName ?? r.passengerPhone ?? "—"}</td>
                  <td className="p-3 text-gray-600">{r.driverName ?? (r.driverId ? "Assigné" : "—")}</td>
                  <td className="p-3">{formatCdf(r.priceCdf ?? r.estimatedPriceCdf ?? 0)}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status ?? "PENDING"} />
                  </td>
                  <td className="p-3 text-gray-500">{formatDate(r.createdAt)}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => openDetail(r)} className="text-[#6C63FF] hover:underline">
                      Détail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail déménagement" wide>
        {selected && (
          <div className="space-y-4 text-sm">
            <p><span className="text-gray-500">Départ:</span> {selected.pickupAddress}</p>
            <p><span className="text-gray-500">Arrivée:</span> {selected.dropoffAddress}</p>
            <p><span className="text-gray-500">Volume:</span> {selected.volumeM3 ?? "—"} m³</p>
            <p><span className="text-gray-500">Prix estimé:</span> {formatCdf(selected.priceCdf ?? selected.estimatedPriceCdf ?? 0)}</p>
            <p><span className="text-gray-500">Statut:</span> <StatusBadge status={selected.status ?? "PENDING"} /></p>
            <p><span className="text-gray-500">Créée:</span> {formatDate(selected.createdAt)}</p>

            <ContactBlock title="Passager" name={selected.passengerName} phone={selected.passengerPhone} />
            <ContactBlock title="Chauffeur / équipe assignée" name={selected.driverName} phone={selected.driverPhone} />

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
                <SelectInput value={newStatus} onChange={setNewStatus} options={STATUSES} />
                <BtnPrimary onClick={saveStatus} disabled={saving || newStatus === selected.status}>
                  {saving ? "Enregistrement…" : "Enregistrer le statut"}
                </BtnPrimary>
              </>
            )}
            {canCancel(selected.status) && !readOnly && (
              <BtnDanger onClick={() => setCancelTarget(selected)}>Annuler la demande</BtnDanger>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
        title="Annuler le déménagement"
        message="Confirmer l'annulation de cette demande ?"
        confirmLabel="Annuler"
        danger
        loading={saving}
      />
    </div>
  );
}
