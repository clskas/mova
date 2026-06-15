"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatCdf, updateDeliveryStatus, type DeliveryOverview } from "@/lib/api";
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
} from "@/components/ui";

const DELIVERY_STATUSES = [
  { value: "PENDING", label: "En attente" },
  { value: "PICKED_UP", label: "Pris en charge" },
  { value: "IN_TRANSIT", label: "En transit" },
  { value: "DELIVERED", label: "Livré" },
  { value: "CANCELLED", label: "Annulé" },
];

export default function LivraisonsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("livraisons");
  const [deliveries, setDeliveries] = useState<DeliveryOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DeliveryOverview | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DeliveryOverview[]>("/api/admin/deliveries");
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveStatus() {
    if (!selected || !newStatus) return;
    setSaving(true);
    setError(null);
    try {
      await updateDeliveryStatus(selected.id, newStatus);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Livraisons" subtitle="Colis, repas et express en cours" />
      {readOnly && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-4">
          Accès lecture seule pour votre rôle.
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : deliveries.length === 0 ? (
        <EmptyState message="Aucune livraison" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Type</th>
                <th className="p-3">Trajet / Restaurant</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Prix</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{d.type ?? "—"}</td>
                  <td className="p-3">
                    {d.type === "FOOD" ? d.restaurantName : `${d.pickupAddress ?? "—"} → ${d.dropoffAddress ?? "—"}`}
                  </td>
                  <td className="p-3"><StatusBadge status={d.status} /></td>
                  <td className="p-3 text-[#6C63FF]">{formatCdf(d.priceCdf)}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => { setSelected(d); setNewStatus(d.status ?? "PENDING"); }} className="text-[#6C63FF] hover:underline">
                      Gérer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Gérer livraison">
        {selected && (
          <div className="space-y-3 text-sm">
            <p><span className="text-gray-500">ID:</span> {selected.id}</p>
            <p><span className="text-gray-500">Type:</span> {selected.type}</p>
            <p><span className="text-gray-500">Statut actuel:</span> <StatusBadge status={selected.status} /></p>
            {!readOnly && (
              <>
                <FieldLabel>Nouveau statut</FieldLabel>
                <SelectInput
                  value={newStatus}
                  onChange={setNewStatus}
                  options={DELIVERY_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                />
                <button
                  type="button"
                  onClick={saveStatus}
                  disabled={saving || newStatus === selected.status}
                  className="w-full bg-[#6C63FF] text-white rounded-xl py-2 font-medium disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Mettre à jour le statut"}
                </button>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
