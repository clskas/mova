"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchDeliveryPricingRules,
  fetchPricingRules,
  formatCdf,
  MOVA_CITIES,
  updateDeliveryPricingRule,
  updatePricingRule,
  type DeliveryPricingRule,
  type PricingRule,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  ErrorBanner,
  LoadingState,
  PageHeader,
  TextInput,
} from "@/components/ui";

const VEHICLE_LABELS: Record<string, string> = {
  MOTO_TAXI: "Moto-taxi",
  STANDARD: "Standard",
  COMFORT: "Confort",
  VIP: "VIP",
};

const DELIVERY_LABELS: Record<string, string> = {
  PARCEL: "Colis",
  FOOD: "Repas",
  EXPRESS: "Express",
};

function VehicleRow({
  label,
  rule,
  city,
  onSave,
  readOnly,
}: {
  label: string;
  rule: PricingRule;
  city: string;
  onSave: (data: Partial<PricingRule>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [base, setBase] = useState(String(rule.baseFareCdf));
  const [km, setKm] = useState(String(rule.perKmCdf));
  const [min, setMin] = useState(String(rule.perMinuteCdf));
  const [minFare, setMinFare] = useState(String(rule.minFareCdf));
  const [peak, setPeak] = useState(String(rule.peakMultiplier ?? 1.3));
  const [night, setNight] = useState(String(rule.nightMultiplier ?? 1.2));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBase(String(rule.baseFareCdf));
    setKm(String(rule.perKmCdf));
    setMin(String(rule.perMinuteCdf));
    setMinFare(String(rule.minFareCdf));
    setPeak(String(rule.peakMultiplier ?? 1.3));
    setNight(String(rule.nightMultiplier ?? 1.2));
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        city,
        baseFareCdf: Number(base),
        perKmCdf: Number(km),
        perMinuteCdf: Number(min),
        minFareCdf: Number(minFare),
        peakMultiplier: Number(peak),
        nightMultiplier: Number(night),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b">
      <td className="p-3 font-medium">{label}</td>
      <td className="p-2"><TextInput value={base} onChange={setBase} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={km} onChange={setKm} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={min} onChange={setMin} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={minFare} onChange={setMinFare} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={peak} onChange={setPeak} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={night} onChange={setNight} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-3 text-gray-500 text-xs hidden lg:table-cell">
        min {formatCdf(Number(minFare))}
      </td>
      <td className="p-3">
        {!readOnly && (
          <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
        )}
      </td>
    </tr>
  );
}

function DeliveryRow({
  label,
  rule,
  onSave,
  readOnly,
}: {
  label: string;
  rule: DeliveryPricingRule;
  onSave: (data: Partial<DeliveryPricingRule>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [baseFee, setBaseFee] = useState(String(rule.baseFeeCdf));
  const [multiplier, setMultiplier] = useState(String(rule.multiplier));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBaseFee(String(rule.baseFeeCdf));
    setMultiplier(String(rule.multiplier));
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        baseFeeCdf: Number(baseFee),
        multiplier: Number(multiplier),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b">
      <td className="p-3 font-medium">{label}</td>
      <td className="p-2"><TextInput value={baseFee} onChange={setBaseFee} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={multiplier} onChange={setMultiplier} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-3 text-gray-500 text-xs hidden md:table-cell max-w-xs">{rule.description ?? "—"}</td>
      <td className="p-3">
        {!readOnly && (
          <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
        )}
      </td>
    </tr>
  );
}

export default function TarifsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("tarifs");
  const [city, setCity] = useState<string>(MOVA_CITIES[0]);
  const [vehicleRules, setVehicleRules] = useState<PricingRule[]>([]);
  const [deliveryRules, setDeliveryRules] = useState<DeliveryPricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, d] = await Promise.all([fetchPricingRules(city), fetchDeliveryPricingRules()]);
      setVehicleRules(Array.isArray(v) ? v : []);
      setDeliveryRules(Array.isArray(d) ? d : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <PageHeader
        title="Tarifs"
        subtitle="Règles tarifaires courses taxi et majorations livraison (CDF)"
      />
      {readOnly && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          Accès lecture seule pour votre rôle.
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="city-select" className="text-sm font-medium text-gray-700">Ville</label>
        <select
          id="city-select"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
        >
          {MOVA_CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-1">Types de véhicule — {city}</h2>
            <p className="text-sm text-gray-500 mb-3">Les majorations pointe/nuit s&apos;appliquent aux estimations en temps réel.</p>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Type</th>
                    <th className="p-3">Prise en charge</th>
                    <th className="p-3">Par km</th>
                    <th className="p-3">Par min</th>
                    <th className="p-3">Minimum</th>
                    <th className="p-3">Pointe ×</th>
                    <th className="p-3">Nuit ×</th>
                    <th className="p-3 hidden lg:table-cell">Aperçu</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleRules.length === 0 ? (
                    <tr><td colSpan={9} className="p-4 text-gray-500">Aucun tarif pour cette ville.</td></tr>
                  ) : (
                    vehicleRules.map((r) => (
                      <VehicleRow
                        key={`${r.vehicleType}-${r.city ?? city}`}
                        label={VEHICLE_LABELS[r.vehicleType] ?? r.vehicleType}
                        rule={r}
                        city={city}
                        readOnly={readOnly}
                        onSave={(data) => updatePricingRule(r.vehicleType, data).then(load)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-1">Majorations livraison</h2>
            <p className="text-sm text-gray-500 mb-3">
              Colis : tarif course Standard + multiplicateur poids. Repas et express : frais de base et multiplicateur sur le tarif course.
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Catégorie</th>
                    <th className="p-3">Frais de base (CDF)</th>
                    <th className="p-3">Multiplicateur</th>
                    <th className="p-3 hidden md:table-cell">Description</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryRules.map((r) => (
                    <DeliveryRow
                      key={r.category}
                      label={DELIVERY_LABELS[r.category] ?? r.category}
                      rule={r}
                      readOnly={readOnly}
                      onSave={(data) => updateDeliveryPricingRule(r.category, data).then(load)}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
