"use client";

import { useCallback, useEffect, useState } from "react";
import { usePartnerLiveRegister } from "@/components/PartnerLiveProvider";
import {
  confirmBookingCash,
  fetchBookings,
  formatCdf,
  formatDate,
  formatDateTime,
  downloadBookingReceiptPdf,
  updateBookingLogistics,
  updateBookingStatus,
  type PartnerBooking,
} from "@/lib/api";

function statusBadge(status?: string, label?: string) {
  const text = label ?? status ?? "—";
  const styles: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    CONTACTED: "bg-blue-100 text-blue-800",
    CONFIRMED: "bg-green-100 text-green-800",
    IN_PROGRESS: "bg-indigo-100 text-indigo-800",
    RETURNED: "bg-gray-100 text-gray-700",
    PAID: "bg-emerald-100 text-emerald-800",
    CLOSED: "bg-red-100 text-red-800",
  };
  const cls = styles[status ?? ""] ?? "bg-gray-100 text-gray-600";
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{text}</span>;
}

function LogisticsEditor({ booking, busy, onSave }: { booking: PartnerBooking; busy: boolean; onSave: () => void }) {
  const [mode, setMode] = useState<"SELF_PASSENGER" | "OWNER_DRIVER">(
    booking.logisticsMode === "OWNER_DRIVER" ? "OWNER_DRIVER" : "SELF_PASSENGER",
  );
  const [ownerName, setOwnerName] = useState(booking.ownerDriverName ?? "");
  const [ownerPhone, setOwnerPhone] = useState(booking.ownerDriverPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setLocalError(null);
    try {
      await updateBookingLogistics(booking.id, {
        logisticsMode: mode,
        ownerDriverName: mode === "OWNER_DRIVER" ? ownerName : undefined,
        ownerDriverPhone: mode === "OWNER_DRIVER" ? ownerPhone : undefined,
      });
      onSave();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Erreur logistique");
    } finally {
      setSaving(false);
    }
  }

  if (booking.status === "IN_PROGRESS" || booking.status === "RETURNED" || booking.status === "CLOSED") {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2 text-sm">
      <p className="font-medium text-gray-800">Votre logistique de remise</p>
      <p className="text-xs text-gray-500">
        Choix passager : {booking.logisticsModeLabel ?? booking.logisticsMode ?? "—"}
        {booking.passengerDriverPhone && ` · chauffeur passager ${booking.passengerDriverPhone}`}
      </p>
      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "SELF_PASSENGER"} onChange={() => setMode("SELF_PASSENGER")} />
        Remise sur place (passager récupère chez moi)
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "OWNER_DRIVER"} onChange={() => setMode("OWNER_DRIVER")} />
        Mon chauffeur livre / récupère le véhicule
      </label>
      {mode === "OWNER_DRIVER" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Nom chauffeur (optionnel)"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Téléphone chauffeur *"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
          />
        </div>
      )}
      {localError && <p className="text-xs text-red-600">{localError}</p>}
      <button
        type="button"
        disabled={busy || saving}
        onClick={save}
        className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 hover:bg-white disabled:opacity-50"
      >
        {saving ? "…" : "Enregistrer la logistique"}
      </button>
    </div>
  );
}

function CashPinConfirm({
  booking,
  busy,
  onDone,
}: {
  booking: PartnerBooking;
  busy: boolean;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!booking.canConfirmCash && booking.status !== "RETURNED") return null;
  if (booking.isPaid || booking.status === "PAID") return null;

  async function submit() {
    if (pin.trim().length < 4) {
      setLocalError("Saisissez le code PIN communiqué par le passager.");
      return;
    }
    setSaving(true);
    setLocalError(null);
    try {
      await confirmBookingCash(booking.id, pin.trim());
      setPin("");
      onDone();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Code PIN incorrect.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2 text-sm">
      <p className="font-medium text-emerald-900">Paiement espèces</p>
      <p className="text-xs text-emerald-800">
        Demandez au passager son code PIN MOVA, puis saisissez-le pour confirmer la réception du montant.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm tracking-widest font-mono flex-1 min-w-[140px]"
          placeholder="Code PIN"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        <button
          type="button"
          disabled={busy || saving}
          onClick={submit}
          className="px-4 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "…" : "Confirmer paiement"}
        </button>
      </div>
      {localError && <p className="text-xs text-red-600">{localError}</p>}
    </div>
  );
}

export default function ReservationsPage() {
  const [bookings, setBookings] = useState<PartnerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchBookings();
      setBookings(Array.isArray(result.data) ? result.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePartnerLiveRegister(load);

  async function act(id: string, action: "acknowledge" | "confirm" | "decline" | "start" | "return") {
    setBusyId(id);
    setError(null);
    try {
      await updateBookingStatus(id, action);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Réservations</h2>
          <p className="text-sm text-gray-500">
            Confirmez vos disponibilités et indiquez qui s&apos;occupe de la remise : vous, votre chauffeur, ou MOVA si le
            passager l&apos;a demandé.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

        {loading ? (
          <p className="text-gray-500">Chargement…</p>
        ) : bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600">Aucune réservation pour le moment.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {bookings.map((b) => {
              const pending = b.status === "PENDING";
              const contacted = b.status === "CONTACTED";
              const confirmed = b.status === "CONFIRMED";
              const inProgress = b.status === "IN_PROGRESS";
              const returned = b.status === "RETURNED";
              const paid = b.status === "PAID" || b.isPaid;
              const closed = b.status === "CLOSED" || paid;
              const amount = b.displayAmountCdf ?? b.ownerNetCdf ?? b.priceCdf;
              const amountLabel = b.displayAmountLabel ?? "Votre gain net";
              const dateRange =
                b.rentalPeriod === "HOURLY"
                  ? `${formatDateTime(b.startDate)} → ${formatDateTime(b.endDate)}`
                  : `${formatDate(b.startDate)} → ${formatDate(b.endDate)}`;
              return (
                <li key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-semibold">{b.vehicleName ?? "Véhicule"}</h3>
                      <p className="text-sm text-gray-500">
                        {dateRange}
                        {b.pickupCity && (
                          <span className="block text-xs mt-0.5">
                            {b.pickupCity}
                            {b.returnCity && b.returnCity !== b.pickupCity ? ` → ${b.returnCity}` : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    {statusBadge(b.status, b.statusLabel)}
                  </div>

                  <div className="text-sm text-gray-700 grid gap-1 sm:grid-cols-2">
                    <p>
                      <span className="text-gray-500">Passager :</span> {b.passengerName ?? b.passengerPhone ?? "—"}
                    </p>
                    <p>
                      <span className="text-gray-500">{amountLabel} :</span> {formatCdf(amount ?? undefined)}
                    </p>
                    {b.remainingLabel && (inProgress || returned) && (
                      <p>
                        <span className="text-gray-500">Temps restant :</span> {b.remainingLabel}
                      </p>
                    )}
                    <p className="sm:col-span-2">
                      <span className="text-gray-500">Logistique :</span> {b.logisticsModeLabel ?? b.logisticsMode ?? "—"}
                      {b.needsMovaLogistics && " · MOVA assignera un chauffeur après votre confirmation"}
                    </p>
                    {b.notes && (
                      <p className="sm:col-span-2">
                        <span className="text-gray-500">Notes :</span> {b.notes}
                      </p>
                    )}
                  </div>

                  <LogisticsEditor booking={b} busy={busyId === b.id} onSave={load} />

                  <CashPinConfirm booking={b} busy={busyId === b.id} onDone={load} />

                  {b.nextStepHint && b.status !== "CLOSED" && !paid && (
                    <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                      {b.nextStepHint}
                    </p>
                  )}

                  {!closed && !returned && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {pending && (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => act(b.id, "acknowledge")}
                          className="px-3 py-1.5 rounded-lg text-sm border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {busyId === b.id ? "…" : "Prendre en charge"}
                        </button>
                      )}
                      {(pending || contacted) && (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => act(b.id, "confirm")}
                          className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {busyId === b.id ? "…" : "Confirmer disponibilité"}
                        </button>
                      )}
                      {(pending || contacted) && (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => act(b.id, "decline")}
                          className="px-3 py-1.5 rounded-lg text-sm border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Refuser
                        </button>
                      )}
                      {confirmed && (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => act(b.id, "start")}
                          className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyId === b.id ? "…" : "Remise effectuée → En cours"}
                        </button>
                      )}
                      {inProgress && (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => act(b.id, "return")}
                          className="px-3 py-1.5 rounded-lg text-sm bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {busyId === b.id ? "…" : "Véhicule rendu"}
                        </button>
                      )}
                    </div>
                  )}
                  {(paid || b.status === "CLOSED" || b.status === "RETURNED") && (
                    <button
                      type="button"
                      onClick={() => downloadBookingReceiptPdf(b.id).catch((e) => alert(e.message))}
                      className="text-xs text-[#6C63FF] underline"
                    >
                      Télécharger reçu partenaire
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
