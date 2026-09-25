"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  assignRideDriver,
  cancelRide,
  fetchDriversForAssignment,
  fetchGpsTrace,
  fetchRide,
  formatCdf,
  formatDate,
  markRidePaid,
  updateRideStatus,
  type AdminDriver,
  type GpsPoint,
  type RideOverview,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import { AssignDriverPanel } from "@/components/AssignDriverPanel";
import { sortDriversByDuty } from "@/lib/driver-assignment";
import { GpsTraceMap } from "@/components/GpsTraceMap";
import { useLiveGpsTrace } from "@/hooks/useLiveGpsTrace";
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

const RIDE_STATUS_OPTIONS = [
  { value: "REQUESTED", label: "Demandée" },
  { value: "SEARCHING", label: "Recherche" },
  { value: "ACCEPTED", label: "Acceptée" },
  { value: "DRIVER_ARRIVED", label: "Chauffeur arrivé" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "COMPLETED", label: "Terminée" },
  { value: "CANCELLED", label: "Annulée" },
];

export default function CoursesPage() {
  const { canWrite, role } = useAdmin();
  const readOnly = !canWrite("courses");
  const isOpsAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const [rides, setRides] = useState<RideOverview[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RideOverview | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RideOverview | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [saving, setSaving] = useState(false);
  const [rideDetail, setRideDetail] = useState<RideOverview | null>(null);
  const [gpsTrace, setGpsTrace] = useState<GpsPoint[]>([]);

  const rideActive = !!selected?.status && !["COMPLETED", "CANCELLED"].includes(selected.status);
  const { points: liveTrace, livePosition, socketLive } = useLiveGpsTrace({
    type: "ride",
    id: selected?.id,
    active: rideActive,
    seed: gpsTrace,
  });

  const statusOptions = useMemo(() => {
    if (!isOpsAdmin) return RIDE_STATUS_OPTIONS;
    return [...RIDE_STATUS_OPTIONS, { value: "PAID", label: "Payé" }];
  }, [isOpsAdmin]);

  useEffect(() => {
    if (!selected?.id) {
      setRideDetail(null);
      setGpsTrace([]);
      return;
    }
    let cancelled = false;
    const loadTrace = async () => {
      try {
        const [detail, trace] = await Promise.all([
          fetchRide(selected.id),
          fetchGpsTrace("ride", selected.id).catch(() => ({ points: [] as GpsPoint[] })),
        ]);
        if (!cancelled) {
          setRideDetail(detail);
          setSelected((prev) => (prev ? { ...prev, ...detail, id: prev.id } : prev));
          const tracePoints = trace.points ?? (Array.isArray(detail.gpsTrace) ? detail.gpsTrace : []);
          setGpsTrace(tracePoints);
        }
      } catch {
        if (!cancelled) {
          setRideDetail(selected);
          setGpsTrace([]);
        }
      }
    };
    loadTrace();
    const timer = rideActive ? setInterval(loadTrace, 15000) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [selected?.id, rideActive]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const [data, driverList] = await Promise.all([
        apiFetch<RideOverview[]>(`/api/admin/rides?${params}`),
        isOpsAdmin ? fetchDriversForAssignment().catch(() => [] as AdminDriver[]) : Promise.resolve([] as AdminDriver[]),
      ]);
      setRides(Array.isArray(data) ? data : []);
      setDrivers(driverList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [status, dateFrom, dateTo, isOpsAdmin]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!loading && !saving) load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load, loading, saving]);

  async function saveStatus() {
    if (!selected || !newStatus) return;
    if (newStatus === "PAID") {
      if (!isOpsAdmin) return;
      setSaving(true);
      setError(null);
      try {
        if (selected.status !== "COMPLETED") {
          await updateRideStatus(selected.id, "COMPLETED");
        }
        await markRidePaid(selected.id);
        setSelected(null);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec du marquage payé");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (newStatus === selected.status) return;
    setSaving(true);
    setError(null);
    try {
      await updateRideStatus(selected.id, newStatus);
      setSelected(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!selected || !assignDriverId || !isOpsAdmin) return;
    setSaving(true);
    setError(null);
    try {
      await assignRideDriver(selected.id, assignDriverId);
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
  const canAssignRide = (r: RideOverview) =>
    isOpsAdmin && !!r.status && !["COMPLETED", "CANCELLED"].includes(r.status);
  const assignableDrivers = sortDriversByDuty(drivers);
  const detail = rideDetail ?? selected;
  const paid = detail?.isPaid === true || newStatus === "PAID";

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
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(r);
                        setNewStatus(r.isPaid ? "PAID" : (r.status ?? ""));
                        setAssignDriverId(r.driverId ?? "");
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

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Détail course" wide>
        {selected && (
          <div className="space-y-3 text-sm">
            <p><span className="text-gray-500">ID:</span> {selected.id}</p>
            <p><span className="text-gray-500">Passager:</span> {selected.passengerId}</p>
            <p><span className="text-gray-500">Chauffeur:</span> {selected.driverId ?? "Non assigné"}</p>
            <p>
              <span className="text-gray-500">Statut:</span>{" "}
              <StatusBadge status={selected.status} />
              {paid && (
                <span className="ml-2">
                  <StatusBadge status="PAID" />
                </span>
              )}
            </p>
            <p><span className="text-gray-500">Départ:</span> {selected.pickupAddress}</p>
            <p><span className="text-gray-500">Arrivée:</span> {selected.dropoffAddress}</p>
            <p><span className="text-gray-500">Prix:</span> {formatCdf(selected.priceCdf)}</p>
            <GpsTraceMap
              title="Trace GPS du trajet"
              points={rideActive ? liveTrace : gpsTrace}
              livePosition={rideActive ? livePosition : null}
              pickup={
                detail?.pickupLat != null && detail?.pickupLng != null
                  ? { lat: detail.pickupLat, lng: detail.pickupLng }
                  : null
              }
              dropoff={
                detail?.dropoffLat != null && detail?.dropoffLng != null
                  ? { lat: detail.dropoffLat, lng: detail.dropoffLng }
                  : null
              }
              pickupLabel={selected.pickupAddress}
              dropoffLabel={selected.dropoffAddress}
              live={rideActive}
            />
            {rideActive && (
              <p className="text-xs text-gray-500">
                {socketLive
                  ? "Suivi WebSocket actif — position mise à jour en direct."
                  : "Connexion temps réel en cours… actualisation HTTP toutes les 15 s."}
              </p>
            )}
            {canAssignRide(selected) && (
              <AssignDriverPanel
                drivers={assignableDrivers}
                value={assignDriverId}
                onChange={setAssignDriverId}
                onAssign={saveAssignment}
                disabled={!isOpsAdmin}
                saving={saving}
                currentDriverId={selected.driverId ?? undefined}
                title="Assigner un livreur / chauffeur"
                fieldLabel="Livreur SENGA (KYC approuvé)"
                hint="L'assignation enregistre le chauffeur et passe la course en « Acceptée » si elle était en recherche."
              />
            )}
            {!readOnly && (
              <>
                <FieldLabel>Changer le statut</FieldLabel>
                <SelectInput
                  value={newStatus}
                  onChange={setNewStatus}
                  options={statusOptions}
                />
                {newStatus === "PAID" && (
                  <p className="text-xs text-gray-500">
                    « Payé » confirme le paiement côté caisse (Admin / Super admin uniquement). Si la course n&apos;est
                    pas encore terminée, elle sera d&apos;abord passée en Terminée.
                  </p>
                )}
                <BtnPrimary
                  onClick={saveStatus}
                  disabled={
                    saving ||
                    (newStatus === "PAID"
                      ? paid
                      : !newStatus || newStatus === selected.status)
                  }
                >
                  {saving ? "Enregistrement…" : "Mettre à jour le statut"}
                </BtnPrimary>
              </>
            )}
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
