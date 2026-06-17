"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelCarpoolTrip,
  fetchCarpoolTrips,
  formatCdf,
  formatDate,
  updateCarpoolStatus,
  type CarpoolTrip,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
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
  { value: "OPEN", label: "Ouvert" },
  { value: "MATCHED", label: "Complet" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "COMPLETED", label: "Terminé" },
  { value: "CANCELLED", label: "Annulé" },
];

export default function CovoituragePage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("covoiturage");
  const [rows, setRows] = useState<CarpoolTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<CarpoolTrip | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [cancelTarget, setCancelTarget] = useState<CarpoolTrip | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchCarpoolTrips());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveStatus() {
    if (!selected || !newStatus || newStatus === selected.status) return;
    setSaving(true);
    try {
      await updateCarpoolStatus(selected.id, newStatus);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function doCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await cancelCarpoolTrip(cancelTarget.id);
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
        title="Covoiturage"
        subtitle="Trajets publiés depuis l'app — lecture, statut, annulation (création côté mobile uniquement)"
      />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucun trajet de covoiturage" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Trajet</th>
                <th className="p-3">Départ</th>
                <th className="p-3">Places</th>
                <th className="p-3">Prix/place</th>
                <th className="p-3">Statut</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <p className="font-medium max-w-xs truncate">{r.fromAddress ?? r.fromCity ?? "—"}</p>
                    <p className="text-xs text-gray-500 max-w-xs truncate">→ {r.toAddress ?? r.toCity ?? "—"}</p>
                  </td>
                  <td className="p-3 text-gray-600">{formatDate(r.departureAt)}</td>
                  <td className="p-3 text-gray-600">
                    {r.passengerCount ?? 0} pass. · {r.seatsAvailable ?? 0} dispo
                  </td>
                  <td className="p-3">{formatCdf(r.pricePerSeatCdf ?? 0)}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status ?? "OPEN"} />
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(r);
                        setNewStatus(r.status ?? "OPEN");
                      }}
                      className="text-[#6C63FF] hover:underline"
                    >
                      Détail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail covoiturage">
        {selected && (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-gray-500">ID:</span> {selected.id}
            </p>
            {selected.driverId && (
              <p>
                <span className="text-gray-500">Conducteur:</span> {selected.driverId}
              </p>
            )}
            <p>
              <span className="text-gray-500">Départ:</span> {selected.fromAddress ?? selected.fromCity}
            </p>
            <p>
              <span className="text-gray-500">Arrivée:</span> {selected.toAddress ?? selected.toCity}
            </p>
            <p>
              <span className="text-gray-500">Date départ:</span> {formatDate(selected.departureAt)}
            </p>
            <p>
              <span className="text-gray-500">Places:</span> {selected.passengerCount ?? 0} réservées,{" "}
              {selected.seatsAvailable ?? 0} disponibles
            </p>
            <p>
              <span className="text-gray-500">Prix / place:</span> {formatCdf(selected.pricePerSeatCdf ?? 0)}
            </p>
            <p>
              <span className="text-gray-500">Statut:</span> <StatusBadge status={selected.status ?? "OPEN"} />
            </p>
            <p>
              <span className="text-gray-500">Créé:</span> {formatDate(selected.createdAt)}
            </p>
            {!readOnly && (
              <>
                <FieldLabel>Modifier le statut</FieldLabel>
                <SelectInput value={newStatus} onChange={setNewStatus} options={STATUSES} />
                <BtnPrimary onClick={saveStatus} disabled={saving || newStatus === selected.status}>
                  {saving ? "Enregistrement…" : "Enregistrer le statut"}
                </BtnPrimary>
              </>
            )}
            {canCancel(selected.status) && !readOnly && (
              <BtnDanger onClick={() => setCancelTarget(selected)}>Annuler le trajet</BtnDanger>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
        title="Annuler le trajet"
        message="Confirmer l'annulation de ce covoiturage ?"
        confirmLabel="Annuler"
        danger
        loading={saving}
      />
    </div>
  );
}
