"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchDeliveryPricingRules,
  fetchPricingRules,
  formatCdf,
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

function EditableRow({
  label,
  rule,
  onSave,
  readOnly,
}: {
  label: string;
  rule: { baseFareCdf: number; perKmCdf: number; perMinuteCdf: number; minFareCdf: number };
  onSave: (data: Partial<PricingRule>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [base, setBase] = useState(String(rule.baseFareCdf));
  const [km, setKm] = useState(String(rule.perKmCdf));
  const [min, setMin] = useState(String(rule.perMinuteCdf));
  const [minFare, setMinFare] = useState(String(rule.minFareCdf));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBase(String(rule.baseFareCdf));
    setKm(String(rule.perKmCdf));
    setMin(String(rule.perMinuteCdf));
    setMinFare(String(rule.minFareCdf));
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        baseFareCdf: Number(base),
        perKmCdf: Number(km),
        perMinuteCdf: Number(min),
        minFareCdf: Number(minFare),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b">
      <td className="p-3 font-medium">{label}</td>
      <td className="p-2"><TextInput value={base} onChange={setBase} type="number" className="!p-2" /></td>
      <td className="p-2"><TextInput value={km} onChange={setKm} type="number" className="!p-2" /></td>
      <td className="p-2"><TextInput value={min} onChange={setMin} type="number" className="!p-2" /></td>
      <td className="p-2"><TextInput value={minFare} onChange={setMinFare} type="number" className="!p-2" /></td>
      <td className="p-3 text-gray-500 text-xs hidden md:table-cell">
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

export default function TarifsPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("tarifs");
  const [vehicleRules, setVehicleRules] = useState<PricingRule[]>([]);
  const [deliveryRules, setDeliveryRules] = useState<DeliveryPricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, d] = await Promise.all([fetchPricingRules(), fetchDeliveryPricingRules()]);
      setVehicleRules(Array.isArray(v) ? v : []);
      setDeliveryRules(Array.isArray(d) ? d : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <PageHeader
        title="Tarifs"
        subtitle="Règles tarifaires courses taxi et livraisons (CDF)"
      />
      {readOnly && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          Accès lecture seule pour votre rôle.
        </p>
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Types de véhicule</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Type</th>
                    <th className="p-3">Prise en charge</th>
                    <th className="p-3">Par km</th>
                    <th className="p-3">Par min</th>
                    <th className="p-3">Minimum</th>
                    <th className="p-3 hidden md:table-cell">Aperçu</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleRules.map((r) => (
                    <EditableRow
                      key={r.vehicleType}
                      label={VEHICLE_LABELS[r.vehicleType] ?? r.vehicleType}
                      rule={r}
                      readOnly={readOnly}
                      onSave={(data) => updatePricingRule(r.vehicleType, data).then(load)}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Catégories livraison</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Catégorie</th>
                    <th className="p-3">Prise en charge</th>
                    <th className="p-3">Par km</th>
                    <th className="p-3">Par min</th>
                    <th className="p-3">Minimum</th>
                    <th className="p-3 hidden md:table-cell">Aperçu</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryRules.map((r) => (
                    <EditableRow
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
