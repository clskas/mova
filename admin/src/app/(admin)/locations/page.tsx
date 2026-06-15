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
import {
  BtnDanger,
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  SelectInput,
  StatusBadge,
} from "@/components/ui";

const STATUSES = ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"];

export default function LocationsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("locations");
  const [rows, setRows] = useState<RentalInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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

  async function setStatus(id: string, status: string) {
    setSaving(id);
    try {
      await updateRentalInquiryStatus(id, status);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec mise à jour");
    } finally {
      setSaving(null);
    }
  }

  async function cancel(id: string) {
    setSaving(id);
    try {
      await cancelRentalInquiry(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec annulation");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Demandes de location" subtitle="Réservations véhicules et inquiries passagers" />
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
                <th className="p-3">Prix est.</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Créée</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{r.vehicleType ?? r.id.slice(0, 8)}</td>
                  <td className="p-3 text-gray-600">
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                  </td>
                  <td className="p-3">{formatCdf(r.estimatedPriceCdf)}</td>
                  <td className="p-3"><StatusBadge status={r.status ?? "PENDING"} /></td>
                  <td className="p-3 text-gray-500">{formatDate(r.createdAt)}</td>
                  <td className="p-3">
                    {!readOnly && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <SelectInput
                          value={r.status ?? "PENDING"}
                          onChange={(status) => setStatus(r.id, status)}
                          disabled={saving === r.id}
                          options={STATUSES.map((s) => ({ value: s, label: s }))}
                        />
                        {r.status !== "CANCELLED" && (
                          <BtnDanger onClick={() => cancel(r.id)} disabled={saving === r.id}>Annuler</BtnDanger>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
