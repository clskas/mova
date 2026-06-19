"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelRentalInquiry,
  fetchRentalInquiries,
  formatCdf,
  formatDate,
  updateRentalInquiryStatus,
  type RentalInquiry,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { ContactBlock } from "@/components/ContactActions";
import {
  BtnDanger,
  BtnPrimary,
  Card,
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
  { value: "CONFIRMED", label: "Confirmée" },
  { value: "CONTACTED", label: "Contacté" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "RETURNED", label: "Retourné" },
  { value: "CLOSED", label: "Clôturée" },
];

export default function LocationsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("locations");
  const [rows, setRows] = useState<RentalInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<RentalInquiry | null>(null);
  const [newStatus, setNewStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchRentalInquiries());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDetail(r: RentalInquiry) {
    setSelected(r);
    setNewStatus(r.status ?? "PENDING");
  }

  async function saveStatus() {
    if (!selected || !newStatus || newStatus === selected.status) return;
    setSaving(true);
    try {
      await updateRentalInquiryStatus(selected.id, newStatus);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    setSaving(true);
    try {
      await cancelRentalInquiry(id);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec annulation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Demandes de location" subtitle="Contact passager et propriétaire du véhicule" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucune demande de location" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Véhicule</th>
                <th className="p-3">Période</th>
                <th className="p-3">Passager</th>
                <th className="p-3">Prix est.</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Créée</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{r.vehicleName ?? r.vehicleType ?? r.id.slice(0, 8)}</td>
                  <td className="p-3 text-gray-600">
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                    {r.pickupCity && (
                      <span className="block text-xs">
                        {r.pickupCity} → {r.returnCity}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">{r.passengerName ?? r.passengerPhone ?? "—"}</td>
                  <td className="p-3">{formatCdf(r.estimatedPriceCdf ?? r.priceCdf ?? 0)}</td>
                  <td className="p-3"><StatusBadge status={r.status ?? "PENDING"} /></td>
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

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail location" wide>
        {selected && (
          <div className="space-y-4 text-sm">
            <p><span className="text-gray-500">Véhicule:</span> {selected.vehicleName ?? selected.vehicleType}</p>
            <p><span className="text-gray-500">Période:</span> {formatDate(selected.startDate)} → {formatDate(selected.endDate)}</p>
            {(selected.pickupCity || selected.returnCity) && (
              <p><span className="text-gray-500">Villes:</span> {selected.pickupCity} → {selected.returnCity}</p>
            )}
            <p><span className="text-gray-500">Prix estimé:</span> {formatCdf(selected.estimatedPriceCdf ?? selected.priceCdf ?? 0)}</p>
            <p><span className="text-gray-500">Statut:</span> <StatusBadge status={selected.status ?? "PENDING"} /></p>
            {selected.notes && (
              <p><span className="text-gray-500">Notes passager:</span> {selected.notes}</p>
            )}

            <ContactBlock title="Passager" name={selected.passengerName} phone={selected.passengerPhone} />
            <ContactBlock title="Propriétaire du véhicule" name={selected.ownerName} phone={selected.ownerContactPhone} />

            {!readOnly && (
              <>
                <FieldLabel>Modifier le statut</FieldLabel>
                <SelectInput value={newStatus} onChange={setNewStatus} options={STATUSES} />
                <BtnPrimary onClick={saveStatus} disabled={saving || newStatus === selected.status}>
                  {saving ? "Enregistrement…" : "Enregistrer le statut"}
                </BtnPrimary>
                {selected.status !== "CLOSED" && (
                  <BtnDanger onClick={() => cancel(selected.id)} disabled={saving}>
                    Clôturer / annuler
                  </BtnDanger>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
