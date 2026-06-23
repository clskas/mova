"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  assignRentalDriver,
  cancelRentalInquiry,
  fetchDriversForAssignment,
  fetchRentalInquiries,
  formatCdf,
  formatDate,
  updateRentalInquiryStatus,
  type AdminDriver,
  type RentalInquiry,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { AssignDriverPanel } from "@/components/AssignDriverPanel";
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

const PARTNER_ADMIN_STATUSES = [
  { value: "CLOSED", label: "Clôturée (litige / annulation MOVA)" },
];

function canAssignLogistics(r: RentalInquiry): boolean {
  if (r.needsMovaLogistics !== true && r.logisticsMode !== "MOVA_DRIVER") return false;
  if (r.status === "CLOSED" || r.status === "RETURNED") return false;
  if (r.ownerUserId) return r.status === "CONFIRMED" || r.status === "IN_PROGRESS";
  return (
    r.status === "CONFIRMED" ||
    r.status === "IN_PROGRESS" ||
    r.status === "CONTACTED" ||
    r.status === "PENDING"
  );
}

function statusOptionsFor(inquiry: RentalInquiry, forceOverride: boolean) {
  if (!inquiry.ownerUserId || forceOverride) return STATUSES;
  const current = STATUSES.find((s) => s.value === inquiry.status);
  return [
    ...(current ? [current] : []),
    ...PARTNER_ADMIN_STATUSES.filter((s) => s.value !== inquiry.status),
  ];
}

export default function LocationsPage() {
  const { canWrite, role } = useAdmin();
  const readOnly = !canWrite("locations");
  const [rows, setRows] = useState<RentalInquiry[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<RentalInquiry | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [rowAssign, setRowAssign] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [forceOverride, setForceOverride] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, driverList] = await Promise.all([
        fetchRentalInquiries(),
        fetchDriversForAssignment().catch(() => [] as AdminDriver[]),
      ]);
      setRows(list);
      setDrivers(driverList);
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
    setAssignDriverId(r.driverId ?? "");
    setForceOverride(false);
  }

  async function saveStatus() {
    if (!selected || !newStatus || newStatus === selected.status) return;
    setSaving(true);
    try {
      await updateRentalInquiryStatus(selected.id, newStatus, forceOverride);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function assignDriver(recordId: string, driverId: string) {
    if (!driverId) return;
    const row = rows.find((r) => r.id === recordId);
    if (row && !canAssignLogistics(row)) {
      setError(
        row.needsMovaLogistics || row.logisticsMode === "MOVA_DRIVER"
          ? "Le propriétaire doit confirmer la disponibilité avant l'assignation logistique MOVA."
          : "Ce mode logistique ne nécessite pas de chauffeur MOVA.",
      );
      return;
    }
    setAssigningId(recordId);
    setError(null);
    try {
      await assignRentalDriver(recordId, driverId);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec assignation");
    } finally {
      setAssigningId(null);
    }
  }

  async function saveAssignment() {
    if (!selected || !assignDriverId) return;
    if (!canAssignLogistics(selected)) {
      setError("Le propriétaire doit confirmer la disponibilité avant l'assignation logistique.");
      return;
    }
    setSaving(true);
    await assignDriver(selected.id, assignDriverId);
    setSaving(false);
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
      <PageHeader title="Demandes de location" subtitle="Contact passager, propriétaire et chauffeur logistique (optionnel)" />
      <p className="text-sm text-gray-600">
        Pour ajouter ou modifier les véhicules du catalogue passager, ouvrez{" "}
        <Link href="/catalogue-location" className="text-[#6C63FF] underline">
          Catalogue location
        </Link>
        .
      </p>
      {readOnly && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-4">
          Accès lecture seule — l&apos;assignation logistique nécessite un rôle avec droits d&apos;écriture sur Locations.
        </p>
      )}
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
                {!readOnly && <th className="p-3">Logistique</th>}
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
                  {!readOnly && (
                    <td className="p-3">
                      {canAssignLogistics(r) ? (
                        <AssignDriverPanel
                          compact
                          drivers={drivers}
                          value={rowAssign[r.id] ?? r.driverId ?? ""}
                          currentDriverId={r.driverId}
                          onChange={(v) => setRowAssign((prev) => ({ ...prev, [r.id]: v }))}
                          onAssign={() => assignDriver(r.id, rowAssign[r.id] ?? "")}
                          saving={assigningId === r.id}
                          assignLabel="Assigner logistique"
                          emptyLabel="Aucun chauffeur KYC — optionnel pour livraison/récupération."
                        />
                      ) : (
                        <span className="text-xs text-gray-500">
                          {r.needsMovaLogistics || r.logisticsMode === "MOVA_DRIVER"
                            ? "Après confirmation propriétaire"
                            : "Pas de chauffeur MOVA"}
                        </span>
                      )}
                    </td>
                  )}
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
            {selected.nextStepHint && (
              <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                {selected.nextStepHint}
              </p>
            )}
            <p>
              <span className="text-gray-500">Logistique:</span>{" "}
              {selected.logisticsModeLabel ?? selected.logisticsMode ?? "—"}
              {selected.needsMovaLogistics && (
                <span className="ml-2 text-xs text-indigo-700">· Chauffeur MOVA requis</span>
              )}
            </p>
            {selected.passengerDriverPhone && (
              <p><span className="text-gray-500">Chauffeur passager:</span> {selected.passengerDriverName ?? "—"} · {selected.passengerDriverPhone}</p>
            )}
            {selected.ownerDriverPhone && (
              <p><span className="text-gray-500">Chauffeur propriétaire:</span> {selected.ownerDriverName ?? "—"} · {selected.ownerDriverPhone}</p>
            )}
            {selected.notes && (
              <p><span className="text-gray-500">Notes passager:</span> {selected.notes}</p>
            )}

            <ContactBlock title="Passager" name={selected.passengerName} phone={selected.passengerPhone} />
            <ContactBlock title="Propriétaire du véhicule" name={selected.ownerName} phone={selected.ownerContactPhone} />
            {selected.ownerUserId && (
              <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                Véhicule partenaire — confirmation et remise/retour gérées par le propriétaire via le portail
                partenaire (bouton « Remise effectuée » pour passer en En cours). Le passager peut aussi confirmer
                la réception ; passage automatique possible à la date de début. L&apos;admin ne peut clôturer
                qu&apos;en cas de litige, ou forcer un statut (override).
              </p>
            )}
            <ContactBlock title="Chauffeur logistique MOVA" name={selected.driverName} phone={selected.driverPhone} />

            {!readOnly && canAssignLogistics(selected) && (
              <AssignDriverPanel
                drivers={drivers}
                value={assignDriverId}
                currentDriverId={selected.driverId}
                onChange={setAssignDriverId}
                onAssign={saveAssignment}
                saving={saving || assigningId === selected.id}
                title="Chauffeur logistique (optionnel)"
                fieldLabel="Chauffeur MOVA pour livraison / récupération"
                assignLabel="Confirmer le chauffeur logistique"
                hint="Disponible après confirmation du propriétaire. Ce chauffeur intervient uniquement pour la logistique (remise et retour)."
                emptyLabel="Aucun chauffeur KYC — la logistique peut être gérée directement par le propriétaire."
              />
            )}

            {!readOnly && !canAssignLogistics(selected) && selected.status !== "CLOSED" && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {selected.needsMovaLogistics || selected.logisticsMode === "MOVA_DRIVER"
                  ? "Assignation logistique MOVA disponible après confirmation du propriétaire."
                  : "Ce mode logistique ne nécessite pas de chauffeur MOVA."}
              </p>
            )}

            {!readOnly && (
              <>
                <FieldLabel>Modifier le statut</FieldLabel>
                <SelectInput
                  value={newStatus}
                  onChange={setNewStatus}
                  options={statusOptionsFor(selected, forceOverride)}
                />
                {selected.ownerUserId && (role === "SUPER_ADMIN" || role === "ADMIN") && (
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={forceOverride}
                      onChange={(e) => setForceOverride(e.target.checked)}
                    />
                    Forcer le statut (override MOVA — cas exceptionnel)
                  </label>
                )}
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
