"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, setDriverStatus, type AdminDriver } from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnSuccess,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  StatusBadge,
} from "@/components/ui";

export default function ChauffeursPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("chauffeurs");
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminDriver | null>(null);
  const [actionTarget, setActionTarget] = useState<{ driver: AdminDriver; activate: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminDriver[]>("/api/admin/drivers");
      setDrivers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.userId.toLowerCase().includes(q) ||
        d.kycStatus?.toLowerCase().includes(q) ||
        d.vehicles?.some((v) => v.plateNumber.toLowerCase().includes(q))
    );
  }, [drivers, search]);

  async function toggleStatus() {
    if (!actionTarget) return;
    setSaving(true);
    try {
      await setDriverStatus(actionTarget.driver.userId, actionTarget.activate, !actionTarget.activate);
      setActionTarget(null);
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Chauffeurs" subtitle={readOnly ? "Consultation profils chauffeurs" : "Profils chauffeurs, KYC et disponibilité"} />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      <div className="space-y-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher par ID, plaque ou statut KYC…" />
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState message="Aucun chauffeur enregistré" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-3">User ID</th>
                  <th className="p-3">KYC</th>
                  <th className="p-3">Note</th>
                  <th className="p-3">Courses</th>
                  <th className="p-3">Dispo</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{d.userId.slice(0, 8)}…</td>
                    <td className="p-3"><StatusBadge status={d.kycStatus} /></td>
                    <td className="p-3">{d.ratingAvg?.toFixed(1) ?? "—"}</td>
                    <td className="p-3">{d.totalRides ?? 0}</td>
                    <td className="p-3">{d.isAvailable ? "✓ Oui" : "Non"}</td>
                    <td className="p-3">
                      <button type="button" onClick={() => setSelected(d)} className="text-[#6C63FF] text-sm hover:underline">
                        Détail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail chauffeur" wide>
        {selected && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <p><span className="text-gray-500">User ID:</span> {selected.userId}</p>
              <p><span className="text-gray-500">KYC:</span> <StatusBadge status={selected.kycStatus} /></p>
              <p><span className="text-gray-500">Note:</span> {selected.ratingAvg?.toFixed(1)} / 5</p>
              <p><span className="text-gray-500">Courses:</span> {selected.totalRides}</p>
              <p><span className="text-gray-500">Permis:</span> {selected.licenseNumber ?? "—"}</p>
              <p><span className="text-gray-500">Disponible:</span> {selected.isAvailable ? "Oui" : "Non"}</p>
            </div>
            {selected.vehicles && selected.vehicles.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Véhicules</p>
                <ul className="text-sm space-y-1">
                  {selected.vehicles.map((v) => (
                    <li key={v.id} className="bg-gray-50 rounded-lg px-3 py-2">
                      {v.type} · {v.plateNumber} {v.make && `· ${v.make} ${v.model ?? ""}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/kyc" className="text-sm text-[#6C63FF] hover:underline inline-block">
              → Voir documents KYC en attente
            </Link>
            {!readOnly && (
              <div className="flex gap-2 pt-2">
                {selected.isAvailable ? (
                  <BtnDanger onClick={() => setActionTarget({ driver: selected, activate: false })}>Suspendre</BtnDanger>
                ) : (
                  <BtnSuccess onClick={() => setActionTarget({ driver: selected, activate: true })}>Activer</BtnSuccess>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={toggleStatus}
        title={actionTarget?.activate ? "Activer le chauffeur" : "Suspendre le chauffeur"}
        message={actionTarget?.activate
          ? "Le chauffeur pourra à nouveau accepter des courses."
          : "Le chauffeur sera suspendu et son compte utilisateur désactivé."}
        confirmLabel={actionTarget?.activate ? "Activer" : "Suspendre"}
        danger={!actionTarget?.activate}
        loading={saving}
      />
    </div>
  );
}
