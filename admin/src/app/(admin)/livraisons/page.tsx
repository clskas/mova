"use client";

import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  assignDeliveryDriver,
  cancelDelivery,
  fetchDriversForAssignment,
  fetchDelivery,
  fetchGpsTrace,
  formatCdf,
  updateDeliveryStatus,
  type AdminDriver,
  type DeliveryOverview,
  type GpsPoint,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { AssignDriverPanel } from "@/components/AssignDriverPanel";
import { filterDriversForParcel } from "@/lib/driver-assignment";
import { ContactBlock } from "@/components/ContactActions";
import { GpsTraceMap } from "@/components/GpsTraceMap";
import { useLiveGpsTrace } from "@/hooks/useLiveGpsTrace";
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
  { value: "PENDING", label: "En attente restaurant" },
  { value: "RESTAURANT_CONFIRMED", label: "En préparation" },
  { value: "READY_FOR_PICKUP", label: "Prête livreur" },
  { value: "PICKED_UP", label: "Pris en charge" },
  { value: "IN_TRANSIT", label: "En transit" },
  { value: "DELIVERED", label: "Livré" },
  { value: "CANCELLED", label: "Annulé" },
];

const ERRAND_STATUSES = [
  { value: "PENDING", label: "En attente coursier" },
  { value: "ASSIGNED", label: "Coursier assigné" },
  { value: "IN_PROGRESS", label: "Courses en cours" },
  { value: "COMPLETED", label: "Terminé" },
  { value: "CANCELLED", label: "Annulé" },
];

function deliveryTypeLabel(type?: string) {
  return type === "ERRAND" ? "Courses & commissions" : (type ?? "—");
}

export default function LivraisonsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("livraisons");
  const canAssign = canWrite("livraisons");
  const [deliveries, setDeliveries] = useState<DeliveryOverview[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DeliveryOverview | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DeliveryOverview | null>(null);
  const [saving, setSaving] = useState(false);
  const [deliveryDetail, setDeliveryDetail] = useState<DeliveryOverview | null>(null);
  const [gpsTrace, setGpsTrace] = useState<GpsPoint[]>([]);

  const deliveryActive =
    !!selected?.status && !["DELIVERED", "COMPLETED", "CANCELLED"].includes(selected.status);
  const { points: liveTrace, livePosition, socketLive } = useLiveGpsTrace({
    type: "delivery",
    id: selected?.id,
    active: deliveryActive,
    seed: gpsTrace,
  });

  useEffect(() => {
    if (!selected?.id) {
      setDeliveryDetail(null);
      setGpsTrace([]);
      return;
    }
    let cancelled = false;
    const traceType = selected.type === "ERRAND" ? "errand" : "delivery";
    const loadTrace = async () => {
      try {
        const [detail, trace] = await Promise.all([
          fetchDelivery(selected.id),
          fetchGpsTrace(traceType, selected.id).catch(() => ({ points: [] as GpsPoint[] })),
        ]);
        if (!cancelled) {
          setDeliveryDetail(detail);
          const tracePoints = trace.points ?? (Array.isArray(detail.gpsTrace) ? detail.gpsTrace : []);
          setGpsTrace(tracePoints);
        }
      } catch {
        if (!cancelled) {
          setDeliveryDetail(selected);
          setGpsTrace([]);
        }
      }
    };
    loadTrace();
    const timer = deliveryActive ? setInterval(loadTrace, 15000) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [selected?.id, selected?.status, selected?.type]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, driverList] = await Promise.all([
        apiFetch<DeliveryOverview[]>("/api/admin/deliveries"),
        fetchDriversForAssignment(),
      ]);
      setDeliveries(Array.isArray(data) ? data : []);
      setDrivers(driverList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!loading && !saving) load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load, loading, saving]);

  function openDetail(d: DeliveryOverview) {
    setSelected(d);
    setNewStatus(d.status ?? "PENDING");
    setAssignDriverId(d.driverId ?? "");
  }

  const canCancel = (s?: string, type?: string) =>
    s && (type === "ERRAND"
      ? !["COMPLETED", "CANCELLED"].includes(s)
      : !["DELIVERED", "CANCELLED"].includes(s));

  async function doCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    setError(null);
    try {
      await cancelDelivery(cancelTarget.id, "Annulé par administrateur");
      setCancelTarget(null);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'annulation");
    } finally {
      setSaving(false);
    }
  }

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

  async function assignDriver(recordId: string, driverId: string) {
    if (!driverId) return;
    setAssigningId(recordId);
    setError(null);
    try {
      await assignDeliveryDriver(recordId, driverId);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec assignation chauffeur");
    } finally {
      setAssigningId(null);
    }
  }

  const canAssignRecord = (d: DeliveryOverview) => {
    if (!canAssign) return false;
    if (d.type === "ERRAND") return !["COMPLETED", "CANCELLED"].includes(d.status ?? "");
    return !["DELIVERED", "CANCELLED"].includes(d.status ?? "");
  };

  const assignableDrivers = selected
    ? filterDriversForParcel(drivers, selected.weightCategory)
    : drivers;

  async function saveAssignment() {
    if (!selected || !assignDriverId) return;
    setSaving(true);
    await assignDriver(selected.id, assignDriverId);
    setSaving(false);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Livraisons" subtitle="Colis, repas, express et courses & commissions" />
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
                <th className="p-3">Coursier</th>
                <th className="p-3">Prix</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{deliveryTypeLabel(d.type)}</td>
                  <td className="p-3">
                    {d.type === "FOOD"
                      ? d.restaurantName
                      : d.type === "ERRAND"
                        ? `${d.pickupAddress ?? "—"} → ${d.dropoffAddress ?? "—"}${d.description ? ` · ${d.description}` : ""}`
                        : `${d.pickupAddress ?? "—"} → ${d.dropoffAddress ?? "—"}`}
                  </td>
                  <td className="p-3"><StatusBadge status={d.status} /></td>
                  <td className="p-3">{d.driverName ?? (d.driverId ? "Assigné" : "—")}</td>
                  <td className="p-3 text-[#6C63FF]">{formatCdf(d.priceCdf)}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => openDetail(d)} className="text-[#6C63FF] hover:underline">
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
            <p><span className="text-gray-500">Type:</span> {deliveryTypeLabel(selected.type)}</p>
            {selected.type === "ERRAND" && selected.description && (
              <p><span className="text-gray-500">Articles:</span> {selected.description}</p>
            )}
            <p><span className="text-gray-500">Statut actuel:</span> <StatusBadge status={selected.status} /></p>
            {selected.passengerName && (
              <ContactBlock title="Passager" name={selected.passengerName} phone={selected.passengerPhone} />
            )}
            {selected.driverName && (
              <ContactBlock title="Coursier assigné" name={selected.driverName} phone={selected.driverPhone} />
            )}
            <GpsTraceMap
              title="Trace GPS du coursier"
              points={deliveryActive ? liveTrace : gpsTrace}
              livePosition={deliveryActive ? livePosition : null}
              pickup={
                deliveryDetail?.pickupLat != null && deliveryDetail?.pickupLng != null
                  ? { lat: deliveryDetail.pickupLat, lng: deliveryDetail.pickupLng }
                  : null
              }
              dropoff={
                deliveryDetail?.dropoffLat != null && deliveryDetail?.dropoffLng != null
                  ? { lat: deliveryDetail.dropoffLat, lng: deliveryDetail.dropoffLng }
                  : null
              }
              pickupLabel={selected.pickupAddress ?? deliveryDetail?.pickupAddress}
              dropoffLabel={selected.dropoffAddress ?? deliveryDetail?.dropoffAddress}
              live={deliveryActive}
            />
            {deliveryActive && (
              <p className="text-xs text-gray-500">
                {socketLive
                  ? "Suivi WebSocket actif — position mise à jour en direct."
                  : "Connexion temps réel en cours… actualisation HTTP toutes les 15 s."}
              </p>
            )}
            {canAssignRecord(selected) && (
              <AssignDriverPanel
                drivers={assignableDrivers}
                value={assignDriverId}
                onChange={setAssignDriverId}
                onAssign={saveAssignment}
                disabled={readOnly}
                saving={saving || assigningId === selected.id}
                currentDriverId={selected.driverId ?? undefined}
              />
            )}
            {canAssignRecord(selected) && (
              <p className="text-xs text-gray-500">
                {selected.type === "ERRAND"
                  ? "L'assignation enregistre le chauffeur et passe le statut à « Coursier assigné ». La mission apparaît alors dans l'app chauffeur."
                  : "L'assignation enregistre le coursier sur cette livraison. Colis moyen/grand : voiture ou utilitaire requis."}
              </p>
            )}
            {!readOnly && (
              <>
                <FieldLabel>Nouveau statut</FieldLabel>
                <SelectInput
                  value={newStatus}
                  onChange={setNewStatus}
                  options={(selected.type === "ERRAND" ? ERRAND_STATUSES : DELIVERY_STATUSES).map((s) => ({
                    value: s.value,
                    label: s.label,
                  }))}
                />
                <button
                  type="button"
                  onClick={saveStatus}
                  disabled={saving || newStatus === selected.status}
                  className="w-full bg-[#6C63FF] text-white rounded-xl py-2 font-medium disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Mettre à jour le statut"}
                </button>
                {canCancel(selected.status, selected.type) && (
                  <BtnDanger onClick={() => setCancelTarget(selected)}>Annuler la livraison</BtnDanger>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
        title="Annuler la livraison"
        message="Confirmer l'annulation de cette livraison ?"
        confirmLabel="Annuler la livraison"
        danger
        loading={saving}
      />
    </div>
  );
}
