"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPricingRule,
  createPromoCode,
  createErrandCategoryEstimate,
  createPricingTimeWindow,
  deactivatePromoCode,
  deleteErrandCategoryEstimate,
  deletePricingRule,
  deletePricingTimeWindow,
  fetchCommissions,
  fetchDeliveryPricingRules,
  fetchErrandCategoryEstimates,
  fetchPricingRules,
  fetchPricingTimeWindows,
  fetchPromoCodes,
  fetchSurcharges,
  fetchMovingVehicleCategories,
  formatCdf,
  MOVA_CITIES,
  updateCommission,
  updateDeliveryPricingRule,
  updateErrandCategoryEstimate,
  updateMovingVehicleCategory,
  updatePricingRule,
  updatePricingTimeWindow,
  updatePromoCode,
  updateSurcharge,
  type DeliveryPricingRule,
  type ErrandCategoryEstimate,
  type MovingVehicleCategoryPricing,
  type PlatformCommission,
  type PricingRule,
  type PricingTimeWindow,
  type PromoCode,
  type ServiceSurcharge,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnDanger,
  BtnPrimary,
  Card,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  Modal,
  PageHeader,
  SelectInput,
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

const SURCHARGE_LABELS: Record<string, string> = {
  MOVING: "Déménagement",
};

const COMMISSION_LABELS: Record<string, string> = {
  RIDE: "Courses (taxi/moto)",
  DELIVERY: "Livraisons",
  MOVING: "Déménagements",
  RENTAL: "Location véhicule",
  CARPOOL: "Covoiturage",
  ERRAND: "Courses & commissions",
};

const ERRAND_CATEGORY_LABELS: Record<string, string> = {
  PHARMACY: "Pharmacie",
  MARKET: "Marché / commerce",
  OTHER: "Autre",
};

const ALL_ERRAND_CATEGORIES = ["PHARMACY", "MARKET", "OTHER"] as const;

function VehicleRow({
  label,
  rule,
  city,
  onSave,
  onDelete,
  readOnly,
}: {
  label: string;
  rule: PricingRule;
  city: string;
  onSave: (data: Partial<PricingRule>) => Promise<void>;
  onDelete?: () => Promise<void>;
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
          <div className="flex gap-2 flex-wrap">
            <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
            {onDelete && (
              <BtnDanger onClick={() => onDelete()}>Supprimer</BtnDanger>
            )}
          </div>
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

function SurchargeRow({
  label,
  rule,
  onSave,
  readOnly,
  showPerUnit,
}: {
  label: string;
  rule: ServiceSurcharge;
  onSave: (data: Partial<ServiceSurcharge>) => Promise<void>;
  readOnly?: boolean;
  showPerUnit?: boolean;
}) {
  const [baseFee, setBaseFee] = useState(String(rule.baseFeeCdf));
  const [multiplier, setMultiplier] = useState(String(rule.multiplier));
  const [perUnit, setPerUnit] = useState(String(rule.perUnitCdf ?? ""));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBaseFee(String(rule.baseFeeCdf));
    setMultiplier(String(rule.multiplier));
    setPerUnit(String(rule.perUnitCdf ?? ""));
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        baseFeeCdf: Number(baseFee),
        multiplier: Number(multiplier),
        ...(showPerUnit ? { perUnitCdf: perUnit.trim() ? Number(perUnit) : null } : {}),
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
      {showPerUnit && (
        <td className="p-2"><TextInput value={perUnit} onChange={setPerUnit} type="number" className="!p-2" disabled={readOnly} placeholder="CDF/m³" /></td>
      )}
      <td className="p-3 text-gray-500 text-xs hidden md:table-cell max-w-xs">{rule.description ?? "—"}</td>
      <td className="p-3">
        {!readOnly && (
          <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
        )}
      </td>
    </tr>
  );
}

function MovingVehicleCategoryRow({
  rule,
  onSave,
  readOnly,
}: {
  rule: MovingVehicleCategoryPricing;
  onSave: (data: Partial<MovingVehicleCategoryPricing>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [label, setLabel] = useState(rule.label);
  const [multiplier, setMultiplier] = useState(String(rule.multiplier));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(rule.label);
    setMultiplier(String(rule.multiplier));
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ label: label.trim(), multiplier: Number(multiplier) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b">
      <td className="p-3 font-medium">{rule.label}</td>
      <td className="p-3 text-xs text-gray-500 font-mono">{rule.category}</td>
      <td className="p-2"><TextInput value={label} onChange={setLabel} className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={multiplier} onChange={setMultiplier} type="number" step="0.01" min={0.1} max={10} className="!p-2" disabled={readOnly} /></td>
      <td className="p-3 text-gray-500 text-xs">× sur (transport + base + volume)</td>
      <td className="p-3">
        {!readOnly && (
          <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
        )}
      </td>
    </tr>
  );
}

function CommissionRow({
  label,
  rule,
  onSave,
  readOnly,
}: {
  label: string;
  rule: PlatformCommission;
  onSave: (data: Partial<PlatformCommission>) => Promise<void>;
  readOnly?: boolean;
}) {
  const [platformPercent, setPlatformPercent] = useState(String(rule.platformPercent));
  const [fixedFee, setFixedFee] = useState(rule.fixedFeeCdf != null ? String(rule.fixedFeeCdf) : "");
  const [perItem, setPerItem] = useState(rule.perItemFeeCdf != null ? String(rule.perItemFeeCdf) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPlatformPercent(String(rule.platformPercent));
    setFixedFee(rule.fixedFeeCdf != null ? String(rule.fixedFeeCdf) : "");
    setPerItem(rule.perItemFeeCdf != null ? String(rule.perItemFeeCdf) : "");
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        platformPercent: Number(platformPercent),
        fixedFeeCdf: fixedFee.trim() ? Number(fixedFee) : null,
        perItemFeeCdf: perItem.trim() ? Number(perItem) : null,
      });
    } finally {
      setSaving(false);
    }
  }

  const driverPct = Math.max(0, 100 - (Number(platformPercent) || 0));

  return (
    <tr className="border-b">
      <td className="p-3 font-medium">{label}</td>
      <td className="p-2">
        <TextInput value={platformPercent} onChange={setPlatformPercent} type="number" className="!p-2" disabled={readOnly} />
      </td>
      <td className="p-3 text-gray-600">{driverPct} %</td>
      <td className="p-2">
        <TextInput value={fixedFee} onChange={setFixedFee} type="number" className="!p-2" disabled={readOnly} placeholder="—" />
      </td>
      <td className="p-2">
        <TextInput value={perItem} onChange={setPerItem} type="number" className="!p-2" disabled={readOnly} placeholder="—" />
      </td>
      <td className="p-3 text-gray-500 text-xs hidden md:table-cell max-w-xs">{rule.description ?? "—"}</td>
      <td className="p-3">
        {!readOnly && (
          <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
        )}
      </td>
    </tr>
  );
}

function ErrandCategoryRow({
  label,
  rule,
  onSave,
  onDeactivate,
  readOnly,
}: {
  label: string;
  rule: ErrandCategoryEstimate;
  onSave: (data: Partial<ErrandCategoryEstimate>) => Promise<void>;
  onDeactivate?: () => void;
  readOnly?: boolean;
}) {
  const [displayLabel, setDisplayLabel] = useState(rule.label);
  const [perItem, setPerItem] = useState(String(rule.perItemCdf));
  const [keywords, setKeywords] = useState(rule.keywordPattern ?? "");
  const [sortOrder, setSortOrder] = useState(String(rule.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayLabel(rule.label);
    setPerItem(String(rule.perItemCdf));
    setKeywords(rule.keywordPattern ?? "");
    setSortOrder(String(rule.sortOrder ?? 0));
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        label: displayLabel.trim(),
        perItemCdf: Number(perItem),
        keywordPattern: keywords.trim() || null,
        sortOrder: Number(sortOrder),
        isActive: true,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className={`border-b ${rule.isActive === false ? "opacity-50" : ""}`}>
      <td className="p-3 font-medium">{label}</td>
      <td className="p-2">
        <TextInput value={displayLabel} onChange={setDisplayLabel} className="!p-2" disabled={readOnly} />
      </td>
      <td className="p-2">
        <TextInput value={perItem} onChange={setPerItem} type="number" className="!p-2" disabled={readOnly} />
      </td>
      <td className="p-2">
        <TextInput
          value={keywords}
          onChange={setKeywords}
          className="!p-2"
          disabled={readOnly}
          placeholder="Regex mots-clés (optionnel)"
        />
      </td>
      <td className="p-2 w-20">
        <TextInput value={sortOrder} onChange={setSortOrder} type="number" className="!p-2" disabled={readOnly} />
      </td>
      <td className="p-3">
        {!readOnly && (
          <div className="flex gap-2 flex-wrap">
            <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
            {onDeactivate && rule.isActive !== false && (
              <BtnDanger onClick={onDeactivate}>Désactiver</BtnDanger>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

const TIME_KIND_LABELS: Record<string, string> = {
  PEAK: "Heure de pointe",
  NIGHT: "Heure de nuit",
};

function formatHourRange(startHour: number, endHour: number) {
  const pad = (h: number) => `${h}`.padStart(2, "0");
  return `${pad(startHour)}h–${pad(endHour)}h`;
}

function TimeWindowRow({
  rule,
  onSave,
  onDelete,
  readOnly,
}: {
  rule: PricingTimeWindow;
  onSave: (data: Partial<PricingTimeWindow>) => Promise<void>;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const [kind, setKind] = useState(rule.kind);
  const [startHour, setStartHour] = useState(String(rule.startHour));
  const [endHour, setEndHour] = useState(String(rule.endHour));
  const [label, setLabel] = useState(rule.label ?? "");
  const [sortOrder, setSortOrder] = useState(String(rule.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKind(rule.kind);
    setStartHour(String(rule.startHour));
    setEndHour(String(rule.endHour));
    setLabel(rule.label ?? "");
    setSortOrder(String(rule.sortOrder ?? 0));
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        kind,
        startHour: Number(startHour),
        endHour: Number(endHour),
        label: label.trim() || null,
        sortOrder: Number(sortOrder),
        isActive: true,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className={`border-b ${rule.isActive === false ? "opacity-50" : ""}`}>
      <td className="p-3 font-medium">
        {readOnly ? (
          TIME_KIND_LABELS[kind] ?? kind
        ) : (
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PricingTimeWindow["kind"])}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white"
          >
            <option value="PEAK">Heure de pointe</option>
            <option value="NIGHT">Heure de nuit</option>
          </select>
        )}
      </td>
      <td className="p-2 w-24">
        <TextInput value={startHour} onChange={setStartHour} type="number" min={0} max={23} className="!p-2" disabled={readOnly} />
      </td>
      <td className="p-2 w-24">
        <TextInput value={endHour} onChange={setEndHour} type="number" min={0} max={23} className="!p-2" disabled={readOnly} />
      </td>
      <td className="p-3 text-gray-600 hidden sm:table-cell">
        {formatHourRange(Number(startHour) || 0, Number(endHour) || 0)}
      </td>
      <td className="p-2">
        <TextInput value={label} onChange={setLabel} className="!p-2" disabled={readOnly} placeholder="Libellé" />
      </td>
      <td className="p-2 w-20">
        <TextInput value={sortOrder} onChange={setSortOrder} type="number" className="!p-2" disabled={readOnly} />
      </td>
      <td className="p-3">
        {!readOnly && (
          <div className="flex gap-2 flex-wrap">
            <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>
            {onDelete && (
              <BtnDanger onClick={onDelete}>Supprimer</BtnDanger>
            )}
          </div>
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
  const [otherSurcharges, setOtherSurcharges] = useState<ServiceSurcharge[]>([]);
  const [movingVehicleCategories, setMovingVehicleCategories] = useState<MovingVehicleCategoryPricing[]>([]);
  const [commissions, setCommissions] = useState<PlatformCommission[]>([]);
  const [errandCategories, setErrandCategories] = useState<ErrandCategoryEstimate[]>([]);
  const [timeWindows, setTimeWindows] = useState<PricingTimeWindow[]>([]);
  const [cityTimezone, setCityTimezone] = useState("Africa/Kinshasa");
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTimeWindowOpen, setCreateTimeWindowOpen] = useState(false);
  const [newTimeKind, setNewTimeKind] = useState<PricingTimeWindow["kind"]>("PEAK");
  const [newTimeStart, setNewTimeStart] = useState("7");
  const [newTimeEnd, setNewTimeEnd] = useState("9");
  const [newTimeLabel, setNewTimeLabel] = useState("");
  const [creatingTimeWindow, setCreatingTimeWindow] = useState(false);
  const [newVehicleType, setNewVehicleType] = useState("STANDARD");
  const [creating, setCreating] = useState(false);
  const [promoModal, setPromoModal] = useState<"create" | PromoCode | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoPercent, setPromoPercent] = useState("");
  const [promoCdf, setPromoCdf] = useState("");
  const [promoMaxUses, setPromoMaxUses] = useState("");
  const [promoValidUntil, setPromoValidUntil] = useState("");
  const [promoSaving, setPromoSaving] = useState(false);

  const existingTypes = new Set(vehicleRules.map((r) => r.vehicleType));
  const missingTypes = Object.keys(VEHICLE_LABELS).filter((t) => !existingTypes.has(t));

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await createPricingRule(newVehicleType, {
        city,
        baseFareCdf: 2000,
        perKmCdf: 1500,
        perMinuteCdf: 200,
        minFareCdf: 3000,
        peakMultiplier: 1.3,
        nightMultiplier: 1.2,
      });
      setCreateOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec création");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(vehicleType: string) {
    if (!confirm(`Supprimer le tarif ${VEHICLE_LABELS[vehicleType] ?? vehicleType} pour ${city} ?`)) return;
    setError(null);
    try {
      await deletePricingRule(vehicleType, city);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec suppression");
    }
  }

  const missingErrandCategories = ALL_ERRAND_CATEGORIES.filter(
    (cat) => !errandCategories.some((r) => r.category === cat),
  );

  async function handleRestoreErrandCategory(category: (typeof ALL_ERRAND_CATEGORIES)[number]) {
    setError(null);
    try {
      await createErrandCategoryEstimate({
        category,
        label: ERRAND_CATEGORY_LABELS[category] ?? category,
        perItemCdf: category === "PHARMACY" ? 8000 : category === "MARKET" ? 3000 : 5000,
        keywordPattern:
          category === "PHARMACY"
            ? "pharmac|médic|medic|drug|para-?pharm"
            : category === "MARKET"
              ? "marché|marche|market|supermarch|commerce|épicer|epicer|boutique"
              : null,
        sortOrder: category === "PHARMACY" ? 1 : category === "MARKET" ? 2 : 3,
        isActive: true,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec création catégorie");
    }
  }

  async function handleDeactivateErrandCategory(category: string) {
    if (!confirm(`Désactiver la catégorie ${ERRAND_CATEGORY_LABELS[category] ?? category} ?`)) return;
    setError(null);
    try {
      await deleteErrandCategoryEstimate(category);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec désactivation");
    }
  }

  async function handleCreateTimeWindow() {
    setCreatingTimeWindow(true);
    setError(null);
    try {
      await createPricingTimeWindow({
        city,
        kind: newTimeKind,
        startHour: Number(newTimeStart),
        endHour: Number(newTimeEnd),
        label: newTimeLabel.trim() || null,
        sortOrder: timeWindows.length + 1,
        isActive: true,
      });
      setCreateTimeWindowOpen(false);
      setNewTimeKind("PEAK");
      setNewTimeStart("7");
      setNewTimeEnd("9");
      setNewTimeLabel("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec création plage horaire");
    } finally {
      setCreatingTimeWindow(false);
    }
  }

  async function handleDeleteTimeWindow(id: string) {
    if (!confirm("Supprimer cette plage horaire ?")) return;
    setError(null);
    try {
      await deletePricingTimeWindow(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec suppression");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, d, s, mvc, c, ec, tw, p] = await Promise.all([
        fetchPricingRules(city),
        fetchDeliveryPricingRules(),
        fetchSurcharges(),
        fetchMovingVehicleCategories(),
        fetchCommissions(),
        fetchErrandCategoryEstimates(),
        fetchPricingTimeWindows(city),
        fetchPromoCodes(),
      ]);
      setVehicleRules(Array.isArray(v) ? v : []);
      setDeliveryRules(Array.isArray(d) ? d : []);
      setOtherSurcharges((Array.isArray(s) ? s : []).filter((x) => x.type === "MOVING"));
      setMovingVehicleCategories(Array.isArray(mvc) ? mvc : []);
      setCommissions(Array.isArray(c) ? c : []);
      setErrandCategories(Array.isArray(ec) ? ec : []);
      setTimeWindows(Array.isArray(tw.windows) ? tw.windows : []);
      setCityTimezone(tw.timezone ?? "Africa/Kinshasa");
      setPromos(Array.isArray(p) ? p : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [city]);

  function openPromoCreate() {
    setPromoCode("");
    setPromoPercent("");
    setPromoCdf("");
    setPromoMaxUses("");
    setPromoValidUntil("");
    setPromoModal("create");
  }

  function openPromoEdit(p: PromoCode) {
    setPromoCode(p.code);
    setPromoPercent(p.discountPercent != null ? String(p.discountPercent) : "");
    setPromoCdf(p.discountCdf != null ? String(p.discountCdf) : "");
    setPromoMaxUses(p.maxUses != null ? String(p.maxUses) : "");
    setPromoValidUntil(p.validUntil ? p.validUntil.slice(0, 10) : "");
    setPromoModal(p);
  }

  async function savePromo() {
    setPromoSaving(true);
    setError(null);
    try {
      const payload = {
        code: promoCode.trim(),
        discountPercent: promoPercent.trim() ? Number(promoPercent) : undefined,
        discountCdf: promoCdf.trim() ? Number(promoCdf) : undefined,
        maxUses: promoMaxUses.trim() ? Number(promoMaxUses) : undefined,
        validUntil: promoValidUntil.trim() ? new Date(promoValidUntil).toISOString() : undefined,
      };
      if (promoModal === "create") {
        await createPromoCode(payload);
      } else if (promoModal) {
        await updatePromoCode(promoModal.id, {
          discountPercent: payload.discountPercent,
          discountCdf: payload.discountCdf,
          maxUses: payload.maxUses,
          validUntil: payload.validUntil ?? null,
        });
      }
      setPromoModal(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement promo");
    } finally {
      setPromoSaving(false);
    }
  }

  async function deactivatePromo(id: string) {
    if (!confirm("Désactiver ce code promo ?")) return;
    try {
      await deactivatePromoCode(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec désactivation");
    }
  }

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
        {!readOnly && missingTypes.length > 0 && (
          <BtnPrimary onClick={() => { setNewVehicleType(missingTypes[0]); setCreateOpen(true); }}>
            Ajouter un type
          </BtnPrimary>
        )}
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
                        onDelete={() => handleDelete(r.vehicleType)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-semibold text-[#1A1A2E] mb-1">Plages horaires — pointe & nuit ({city})</h2>
                <p className="text-sm text-gray-500">
                  Créneaux appliqués aux estimations taxi/moto selon l&apos;heure locale de la ville
                  (<strong>{cityTimezone}</strong>
                  {cityTimezone === "Africa/Kinshasa" ? ", UTC+1" : cityTimezone === "Africa/Lubumbashi" ? ", UTC+2" : ""}).
                  Les multiplicateurs (colonnes Pointe × / Nuit ×) restent configurés par type de véhicule ci-dessus.
                  Heure de fin exclusive (ex. 07h–09h = 7h00 à 8h59). Plage overnight : ex. 22h–05h.
                </p>
              </div>
              {!readOnly && (
                <BtnPrimary onClick={() => setCreateTimeWindowOpen((v) => !v)}>
                  {createTimeWindowOpen ? "Annuler" : "Ajouter une plage"}
                </BtnPrimary>
              )}
            </div>
            {createTimeWindowOpen && !readOnly && (
              <Card className="p-4 mb-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Type</label>
                    <select
                      value={newTimeKind}
                      onChange={(e) => setNewTimeKind(e.target.value as PricingTimeWindow["kind"])}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                    >
                      <option value="PEAK">Heure de pointe</option>
                      <option value="NIGHT">Heure de nuit</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Début (0–23)</label>
                    <TextInput value={newTimeStart} onChange={setNewTimeStart} type="number" min={0} max={23} className="!p-2 w-24" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fin (exclusif)</label>
                    <TextInput value={newTimeEnd} onChange={setNewTimeEnd} type="number" min={0} max={23} className="!p-2 w-24" />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs text-gray-500 mb-1">Libellé</label>
                    <TextInput value={newTimeLabel} onChange={setNewTimeLabel} className="!p-2" placeholder="Matin, Soir, Nuit…" />
                  </div>
                  <BtnPrimary onClick={handleCreateTimeWindow} disabled={creatingTimeWindow}>
                    {creatingTimeWindow ? "…" : "Créer"}
                  </BtnPrimary>
                </div>
              </Card>
            )}
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Type</th>
                    <th className="p-3">Début</th>
                    <th className="p-3">Fin</th>
                    <th className="p-3 hidden sm:table-cell">Aperçu</th>
                    <th className="p-3">Libellé</th>
                    <th className="p-3">Ordre</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {timeWindows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-gray-500">
                        Aucune plage pour cette ville — utilisez « Ajouter une plage » ou redémarrez le service pour le seed.
                      </td>
                    </tr>
                  ) : (
                    timeWindows.map((r) => (
                      <TimeWindowRow
                        key={r.id}
                        rule={r}
                        readOnly={readOnly}
                        onSave={(data) => updatePricingTimeWindow(r.id, data).then(load)}
                        onDelete={() => handleDeleteTimeWindow(r.id)}
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

          <section>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-semibold text-[#1A1A2E] mb-1">Estimation achats — Courses & commissions</h2>
                <p className="text-sm text-gray-500">
                  Montant indicatif par article selon le type de commerce détecté (mots-clés dans l&apos;adresse ou la liste).
                  Formule : achats estimés = montant × nombre d&apos;articles.
                </p>
              </div>
              {!readOnly && missingErrandCategories.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {missingErrandCategories.map((cat) => (
                    <BtnPrimary key={cat} onClick={() => handleRestoreErrandCategory(cat)}>
                      Restaurer {ERRAND_CATEGORY_LABELS[cat]}
                    </BtnPrimary>
                  ))}
                </div>
              )}
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Code</th>
                    <th className="p-3">Libellé</th>
                    <th className="p-3">Par article (CDF)</th>
                    <th className="p-3">Mots-clés (regex)</th>
                    <th className="p-3">Ordre</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {errandCategories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-gray-500">
                        Aucune catégorie — utilisez « Restaurer » ou redémarrez le service pour le seed.
                      </td>
                    </tr>
                  ) : (
                    errandCategories.map((r) => (
                      <ErrandCategoryRow
                        key={r.category}
                        label={ERRAND_CATEGORY_LABELS[r.category] ?? r.category}
                        rule={r}
                        readOnly={readOnly}
                        onSave={(data) => updateErrandCategoryEstimate(r.category, data).then(load)}
                        onDeactivate={() => handleDeactivateErrandCategory(r.category)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </section>

          {otherSurcharges.length > 0 && (
            <section>
              <h2 className="font-semibold text-[#1A1A2E] mb-1">Majorations déménagement</h2>
              <p className="text-sm text-gray-500 mb-3">Frais de base, multiplicateur et tarif au m³ pour les courses déménagement.</p>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="p-3">Service</th>
                      <th className="p-3">Frais de base (CDF)</th>
                      <th className="p-3">Multiplicateur</th>
                      <th className="p-3">Par m³ (CDF)</th>
                      <th className="p-3 hidden md:table-cell">Description</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherSurcharges.map((r) => (
                      <SurchargeRow
                        key={r.type}
                        label={SURCHARGE_LABELS[r.type] ?? r.type}
                        rule={r}
                        showPerUnit
                        readOnly={readOnly}
                        onSave={(data) => updateSurcharge(r.type, data).then(load)}
                      />
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}

          {movingVehicleCategories.length > 0 && (
            <section>
              <h2 className="font-semibold text-[#1A1A2E] mb-1">Coefficients par engin déménagement</h2>
              <p className="text-sm text-gray-500 mb-3">
                Multiplicateur appliqué selon le type d&apos;engin demandé (camionnette, 15 m³, 30 m³, 50 m³).
                Le total estimé = (transport STANDARD × coef. MOVING + frais base + volume × CDF/m³) × coefficient engin.
              </p>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="p-3">Libellé actuel</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Libellé affiché</th>
                      <th className="p-3">Coefficient</th>
                      <th className="p-3">Effet</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movingVehicleCategories.map((r) => (
                      <MovingVehicleCategoryRow
                        key={r.category}
                        rule={r}
                        readOnly={readOnly}
                        onSave={(data) => updateMovingVehicleCategory(r.category, data).then(load)}
                      />
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-1">Commissions plateforme MOVA</h2>
            <p className="text-sm text-gray-500 mb-3">
              Part prélevée par MOVA sur chaque service. Le reste revient au chauffeur / partenaire. Les revenus chauffeur affichés dans l&apos;app sont nets de commission.
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Service</th>
                    <th className="p-3">MOVA (%)</th>
                    <th className="p-3">Chauffeur (%)</th>
                    <th className="p-3">Frais fixe (CDF)</th>
                    <th className="p-3">Par article (CDF)</th>
                    <th className="p-3 hidden md:table-cell">Description</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-gray-500">Aucune commission configurée.</td></tr>
                  ) : (
                    commissions.map((r) => (
                      <CommissionRow
                        key={r.serviceType}
                        label={COMMISSION_LABELS[r.serviceType] ?? r.serviceType}
                        rule={r}
                        readOnly={readOnly}
                        onSave={(data) => updateCommission(r.serviceType, data).then(load)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#1A1A2E]">Codes promo</h2>
                <p className="text-sm text-gray-500">Réduction en % ou montant fixe CDF ; désactivation sans suppression.</p>
              </div>
              {!readOnly && <BtnPrimary onClick={openPromoCreate}>Nouveau code</BtnPrimary>}
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Code</th>
                    <th className="p-3">Réduction</th>
                    <th className="p-3">Utilisations</th>
                    <th className="p-3">Expire</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {promos.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-400">Aucun code promo</td></tr>
                  ) : promos.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3 font-mono font-medium">{p.code}</td>
                      <td className="p-3">
                        {p.discountPercent != null ? `${p.discountPercent} %` : p.discountCdf != null ? formatCdf(p.discountCdf) : "—"}
                      </td>
                      <td className="p-3">{p.usedCount ?? 0}{p.maxUses != null ? ` / ${p.maxUses}` : ""}</td>
                      <td className="p-3">{p.validUntil ? new Date(p.validUntil).toLocaleDateString("fr-FR") : "—"}</td>
                      <td className="p-3">
                        <span className={p.isActive ? "text-green-600" : "text-gray-400"}>{p.isActive ? "Actif" : "Inactif"}</span>
                      </td>
                      <td className="p-3 flex gap-2">
                        {!readOnly && (
                          <>
                            <BtnPrimary onClick={() => openPromoEdit(p)}>Modifier</BtnPrimary>
                            {p.isActive && <BtnDanger onClick={() => deactivatePromo(p.id)}>Désactiver</BtnDanger>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={`Nouveau tarif — ${city}`}>
        <div className="space-y-4">
          <label>
            <FieldLabel>Type de véhicule</FieldLabel>
            <SelectInput
              value={newVehicleType}
              onChange={setNewVehicleType}
              options={missingTypes.map((t) => ({ value: t, label: VEHICLE_LABELS[t] ?? t }))}
            />
          </label>
          <p className="text-sm text-gray-500">Des valeurs par défaut seront créées ; vous pourrez les modifier ensuite.</p>
          <div className="flex gap-2">
            <BtnPrimary onClick={handleCreate} disabled={creating}>{creating ? "Création…" : "Créer"}</BtnPrimary>
            <BtnDanger onClick={() => setCreateOpen(false)}>Annuler</BtnDanger>
          </div>
        </div>
      </Modal>

      <Modal open={promoModal !== null} onClose={() => setPromoModal(null)} title={promoModal === "create" ? "Nouveau code promo" : "Modifier code promo"}>
        <div className="space-y-4">
          <label>
            <FieldLabel>Code</FieldLabel>
            <TextInput value={promoCode} onChange={setPromoCode} disabled={promoModal !== "create" || readOnly} placeholder="MOVA2025" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <FieldLabel>Réduction (%)</FieldLabel>
              <TextInput value={promoPercent} onChange={setPromoPercent} type="number" disabled={readOnly} placeholder="10" />
            </label>
            <label>
              <FieldLabel>Montant fixe (CDF)</FieldLabel>
              <TextInput value={promoCdf} onChange={setPromoCdf} type="number" disabled={readOnly} placeholder="5000" />
            </label>
          </div>
          <p className="text-xs text-gray-500">Indiquez % ou montant fixe (pas les deux obligatoires).</p>
          <label>
            <FieldLabel>Utilisations max</FieldLabel>
            <TextInput value={promoMaxUses} onChange={setPromoMaxUses} type="number" disabled={readOnly} placeholder="Illimité" />
          </label>
          <label>
            <FieldLabel>Date d&apos;expiration</FieldLabel>
            <TextInput value={promoValidUntil} onChange={setPromoValidUntil} type="date" disabled={readOnly} />
          </label>
          <div className="flex gap-2">
            {!readOnly && <BtnPrimary onClick={savePromo} disabled={promoSaving}>{promoSaving ? "Enregistrement…" : "Enregistrer"}</BtnPrimary>}
            <BtnDanger onClick={() => setPromoModal(null)}>Fermer</BtnDanger>
          </div>
        </div>
      </Modal>
    </div>
  );
}
