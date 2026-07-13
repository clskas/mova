"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCancellationPolicies,
  fetchParcelWeightBands,
  fetchPlatformConfig,
  updateCancellationPolicy,
  updateParcelWeightBand,
  updatePlatformConfig,
  type CancellationPolicy,
  type ParcelWeightBand,
  type PlatformConfigData,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  ErrorBanner,
  FieldLabel,
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

function NumField({
  label,
  value,
  onChange,
  step,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <TextInput value={value} onChange={onChange} type="number" step={step} className="!p-2" disabled={disabled} />
    </div>
  );
}

export default function ReglesPlateformePage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("tarifs");
  const [config, setConfig] = useState<PlatformConfigData | null>(null);
  const [cancellationPolicies, setCancellationPolicies] = useState<CancellationPolicy[]>([]);
  const [weightBands, setWeightBands] = useState<ParcelWeightBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const [interCityBase, setInterCityBase] = useState("");
  const [interCityPerKm, setInterCityPerKm] = useState("");
  const [foodMaxKm, setFoodMaxKm] = useState("");
  const [foodMaxFee, setFoodMaxFee] = useState("");
  const [foodInterCityMaxKm, setFoodInterCityMaxKm] = useState("");
  const [restaurantRadius, setRestaurantRadius] = useState("");
  const [matchInitial, setMatchInitial] = useState("");
  const [matchIncrement, setMatchIncrement] = useState("");
  const [matchInterval, setMatchInterval] = useState("");
  const [matchMax, setMatchMax] = useState("");
  const [weightProximity, setWeightProximity] = useState("");
  const [weightRating, setWeightRating] = useState("");
  const [weightAcceptance, setWeightAcceptance] = useState("");
  const [weightSeniority, setWeightSeniority] = useState("");
  const [schedAutoAssign, setSchedAutoAssign] = useState("");
  const [schedLateHours, setSchedLateHours] = useState("");
  const [schedLatePct, setSchedLatePct] = useState("");
  const [schedMaxDays, setSchedMaxDays] = useState("");
  const [roadFactor, setRoadFactor] = useState("");
  const [speedRide, setSpeedRide] = useState("");
  const [speedDelivery, setSpeedDelivery] = useState("");
  const [speedMoving, setSpeedMoving] = useState("");
  const [peakDefault, setPeakDefault] = useState("");
  const [nightDefault, setNightDefault] = useState("");
  const [combinedPeakNight, setCombinedPeakNight] = useState("");
  const [carpoolRadius, setCarpoolRadius] = useState("");

  function applyConfig(c: PlatformConfigData) {
    setConfig(c);
    setInterCityBase(String(c.interCity.baseSurchargeCdf));
    setInterCityPerKm(String(c.interCity.perKmSurchargeCdf));
    setFoodMaxKm(String(c.delivery.maxFoodDeliveryDistanceKm));
    setFoodMaxFee(String(c.delivery.maxFoodDeliveryFeeCdf));
    setFoodInterCityMaxKm(String(c.delivery.maxFoodInterCityDistanceKm));
    setRestaurantRadius(String(c.delivery.restaurantListRadiusKm));
    setMatchInitial(String(c.matching.initialRadiusKm));
    setMatchIncrement(String(c.matching.radiusIncrementKm));
    setMatchInterval(String(c.matching.radiusIncrementIntervalSec));
    setMatchMax(String(c.matching.maxRadiusKm));
    setWeightProximity(String(c.matching.scoreWeights.proximity));
    setWeightRating(String(c.matching.scoreWeights.rating));
    setWeightAcceptance(String(c.matching.scoreWeights.acceptanceRate));
    setWeightSeniority(String(c.matching.scoreWeights.seniority));
    setSchedAutoAssign(String(c.scheduled.autoAssignHoursBefore));
    setSchedLateHours(String(c.scheduled.lateCancelHoursBefore));
    setSchedLatePct(String(c.scheduled.lateCancelFeePct));
    setSchedMaxDays(String(c.scheduled.maxScheduleDays));
    setRoadFactor(String(c.trip.roadDistanceFactor));
    setSpeedRide(String(c.trip.averageSpeedKmh.ride));
    setSpeedDelivery(String(c.trip.averageSpeedKmh.delivery));
    setSpeedMoving(String(c.trip.averageSpeedKmh.moving));
    setPeakDefault(String(c.pricing.defaultPeakMultiplier));
    setNightDefault(String(c.pricing.defaultNightMultiplier));
    setCombinedPeakNight(String(c.pricing.combinedPeakNightMultiplier));
    setCarpoolRadius(String(c.carpool.matchRadiusKm));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pc, cp, wb] = await Promise.all([
        fetchPlatformConfig(),
        fetchCancellationPolicies(),
        fetchParcelWeightBands(),
      ]);
      applyConfig(pc.config);
      setCancellationPolicies(cp);
      setWeightBands(wb);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePlatform(section: string, patch: Record<string, unknown>) {
    setSavingSection(section);
    setError(null);
    try {
      const res = await updatePlatformConfig(patch);
      applyConfig(res.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSavingSection(null);
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Règles plateforme"
        subtitle="Paramètres globaux encore en dur dans le code — dispatch, inter-ville, livraison repas, annulations, colis."
      />
      {error && <ErrorBanner message={error} />}
      {loading || !config ? (
        <LoadingState label="Chargement des règles…" />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Majoration inter-ville</h2>
            <Card className="p-4 grid sm:grid-cols-2 gap-4 max-w-xl">
              <NumField label="Base (CDF)" value={interCityBase} onChange={setInterCityBase} disabled={readOnly} />
              <NumField label="Par km (CDF)" value={interCityPerKm} onChange={setInterCityPerKm} disabled={readOnly} />
              {!readOnly && (
                <div className="sm:col-span-2">
                  <BtnPrimary
                    disabled={savingSection === "interCity"}
                    onClick={() =>
                      savePlatform("interCity", {
                        interCity: {
                          baseSurchargeCdf: Number(interCityBase),
                          perKmSurchargeCdf: Number(interCityPerKm),
                        },
                      })
                    }
                  >
                    {savingSection === "interCity" ? "…" : "Enregistrer inter-ville"}
                  </BtnPrimary>
                </div>
              )}
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Livraison repas — zones & plafonds</h2>
            <Card className="p-4 grid sm:grid-cols-2 gap-4 max-w-2xl">
              <NumField label="Distance max locale (km)" value={foodMaxKm} onChange={setFoodMaxKm} disabled={readOnly} />
              <NumField label="Distance max inter-ville (km)" value={foodInterCityMaxKm} onChange={setFoodInterCityMaxKm} disabled={readOnly} />
              <NumField label="Frais max (CDF)" value={foodMaxFee} onChange={setFoodMaxFee} disabled={readOnly} />
              <NumField label="Rayon liste restaurants (km)" value={restaurantRadius} onChange={setRestaurantRadius} disabled={readOnly} />
              {!readOnly && (
                <div className="sm:col-span-2">
                  <BtnPrimary
                    disabled={savingSection === "delivery"}
                    onClick={() =>
                      savePlatform("delivery", {
                        delivery: {
                          maxFoodDeliveryDistanceKm: Number(foodMaxKm),
                          maxFoodInterCityDistanceKm: Number(foodInterCityMaxKm),
                          maxFoodDeliveryFeeCdf: Number(foodMaxFee),
                          restaurantListRadiusKm: Number(restaurantRadius),
                        },
                      })
                    }
                  >
                    {savingSection === "delivery" ? "…" : "Enregistrer livraison repas"}
                  </BtnPrimary>
                </div>
              )}
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Dispatch chauffeurs (matching)</h2>
            <Card className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <NumField label="Rayon initial (km)" value={matchInitial} onChange={setMatchInitial} disabled={readOnly} />
              <NumField label="Incrément (km)" value={matchIncrement} onChange={setMatchIncrement} disabled={readOnly} />
              <NumField label="Intervalle (s)" value={matchInterval} onChange={setMatchInterval} disabled={readOnly} />
              <NumField label="Rayon max (km)" value={matchMax} onChange={setMatchMax} disabled={readOnly} />
              <NumField label="Poids proximité" value={weightProximity} onChange={setWeightProximity} step="0.01" disabled={readOnly} />
              <NumField label="Poids note" value={weightRating} onChange={setWeightRating} step="0.01" disabled={readOnly} />
              <NumField label="Poids acceptation" value={weightAcceptance} onChange={setWeightAcceptance} step="0.01" disabled={readOnly} />
              <NumField label="Poids ancienneté" value={weightSeniority} onChange={setWeightSeniority} step="0.01" disabled={readOnly} />
              {!readOnly && (
                <div className="lg:col-span-4">
                  <BtnPrimary
                    disabled={savingSection === "matching"}
                    onClick={() =>
                      savePlatform("matching", {
                        matching: {
                          initialRadiusKm: Number(matchInitial),
                          radiusIncrementKm: Number(matchIncrement),
                          radiusIncrementIntervalSec: Number(matchInterval),
                          maxRadiusKm: Number(matchMax),
                          scoreWeights: {
                            proximity: Number(weightProximity),
                            rating: Number(weightRating),
                            acceptanceRate: Number(weightAcceptance),
                            seniority: Number(weightSeniority),
                          },
                        },
                      })
                    }
                  >
                    {savingSection === "matching" ? "…" : "Enregistrer dispatch"}
                  </BtnPrimary>
                </div>
              )}
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Courses planifiées</h2>
            <Card className="p-4 grid sm:grid-cols-2 gap-4 max-w-xl">
              <NumField label="Assignation auto (h avant)" value={schedAutoAssign} onChange={setSchedAutoAssign} disabled={readOnly} />
              <NumField label="Annulation tardive (h avant)" value={schedLateHours} onChange={setSchedLateHours} disabled={readOnly} />
              <NumField label="Frais annulation tardive (%)" value={schedLatePct} onChange={setSchedLatePct} disabled={readOnly} />
              <NumField label="Horizon réservation (jours)" value={schedMaxDays} onChange={setSchedMaxDays} disabled={readOnly} />
              {!readOnly && (
                <div className="sm:col-span-2">
                  <BtnPrimary
                    disabled={savingSection === "scheduled"}
                    onClick={() =>
                      savePlatform("scheduled", {
                        scheduled: {
                          autoAssignHoursBefore: Number(schedAutoAssign),
                          lateCancelHoursBefore: Number(schedLateHours),
                          lateCancelFeePct: Number(schedLatePct),
                          maxScheduleDays: Number(schedMaxDays),
                        },
                      })
                    }
                  >
                    {savingSection === "scheduled" ? "…" : "Enregistrer planifiées"}
                  </BtnPrimary>
                </div>
              )}
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Estimation trajet & majorations par défaut</h2>
            <Card className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NumField label="Facteur détour route" value={roadFactor} onChange={setRoadFactor} step="0.01" disabled={readOnly} />
              <NumField label="Vitesse course (km/h)" value={speedRide} onChange={setSpeedRide} disabled={readOnly} />
              <NumField label="Vitesse livraison (km/h)" value={speedDelivery} onChange={setSpeedDelivery} disabled={readOnly} />
              <NumField label="Vitesse déménagement (km/h)" value={speedMoving} onChange={setSpeedMoving} disabled={readOnly} />
              <NumField label="Majoration pointe défaut" value={peakDefault} onChange={setPeakDefault} step="0.01" disabled={readOnly} />
              <NumField label="Majoration nuit défaut" value={nightDefault} onChange={setNightDefault} step="0.01" disabled={readOnly} />
              <NumField label="Pointe + nuit combinées" value={combinedPeakNight} onChange={setCombinedPeakNight} step="0.01" disabled={readOnly} />
              <NumField label="Rayon covoiturage (km)" value={carpoolRadius} onChange={setCarpoolRadius} disabled={readOnly} />
              {!readOnly && (
                <div className="lg:col-span-3 flex gap-2 flex-wrap">
                  <BtnPrimary
                    disabled={savingSection === "trip"}
                    onClick={() =>
                      savePlatform("trip", {
                        trip: {
                          roadDistanceFactor: Number(roadFactor),
                          averageSpeedKmh: {
                            ride: Number(speedRide),
                            delivery: Number(speedDelivery),
                            moving: Number(speedMoving),
                          },
                        },
                      })
                    }
                  >
                    {savingSection === "trip" ? "…" : "Enregistrer estimation"}
                  </BtnPrimary>
                  <BtnPrimary
                    disabled={savingSection === "pricing"}
                    onClick={() =>
                      savePlatform("pricing", {
                        pricing: {
                          defaultPeakMultiplier: Number(peakDefault),
                          defaultNightMultiplier: Number(nightDefault),
                          combinedPeakNightMultiplier: Number(combinedPeakNight),
                        },
                        carpool: { matchRadiusKm: Number(carpoolRadius) },
                      })
                    }
                  >
                    {savingSection === "pricing" ? "…" : "Enregistrer majorations & covoiturage"}
                  </BtnPrimary>
                </div>
              )}
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Annulation courses (par type véhicule)</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Véhicule</th>
                    <th className="p-3">Gratuit (min)</th>
                    <th className="p-3">Frais passager (CDF)</th>
                    <th className="p-3">Compensation chauffeur</th>
                    <th className="p-3">No-show (CDF)</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {cancellationPolicies.map((p) => (
                    <CancellationPolicyRow key={p.vehicleType} policy={p} readOnly={readOnly} onSaved={load} />
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <section>
            <h2 className="font-semibold text-[#1A1A2E] mb-3">Colis — bandes de poids</h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Libellé</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Poids max (kg)</th>
                    <th className="p-3">Multiplicateur</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {weightBands.map((b) => (
                    <WeightBandRow key={b.category} band={b} readOnly={readOnly} onSaved={load} />
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function CancellationPolicyRow({
  policy,
  readOnly,
  onSaved,
}: {
  policy: CancellationPolicy;
  readOnly?: boolean;
  onSaved: () => Promise<void>;
}) {
  const [freeMin, setFreeMin] = useState(String(policy.freeCancelMinutes));
  const [passengerFee, setPassengerFee] = useState(String(policy.passengerFeeCdf));
  const [driverComp, setDriverComp] = useState(String(policy.driverCompensationCdf));
  const [noShow, setNoShow] = useState(String(policy.noShowFeeCdf));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFreeMin(String(policy.freeCancelMinutes));
    setPassengerFee(String(policy.passengerFeeCdf));
    setDriverComp(String(policy.driverCompensationCdf));
    setNoShow(String(policy.noShowFeeCdf));
  }, [policy]);

  async function save() {
    setSaving(true);
    try {
      await updateCancellationPolicy(policy.vehicleType, {
        freeCancelMinutes: Number(freeMin),
        passengerFeeCdf: Number(passengerFee),
        driverCompensationCdf: Number(driverComp),
        noShowFeeCdf: Number(noShow),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b">
      <td className="p-3 font-medium">{VEHICLE_LABELS[policy.vehicleType] ?? policy.vehicleType}</td>
      <td className="p-2"><TextInput value={freeMin} onChange={setFreeMin} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={passengerFee} onChange={setPassengerFee} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={driverComp} onChange={setDriverComp} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={noShow} onChange={setNoShow} type="number" className="!p-2" disabled={readOnly} /></td>
      <td className="p-3">{!readOnly && <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>}</td>
    </tr>
  );
}

function WeightBandRow({
  band,
  readOnly,
  onSaved,
}: {
  band: ParcelWeightBand;
  readOnly?: boolean;
  onSaved: () => Promise<void>;
}) {
  const [label, setLabel] = useState(band.label);
  const [maxKg, setMaxKg] = useState(String(band.maxKg));
  const [multiplier, setMultiplier] = useState(String(band.multiplier));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(band.label);
    setMaxKg(String(band.maxKg));
    setMultiplier(String(band.multiplier));
  }, [band]);

  async function save() {
    setSaving(true);
    try {
      await updateParcelWeightBand(band.category, {
        label: label.trim(),
        maxKg: Number(maxKg),
        multiplier: Number(multiplier),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b">
      <td className="p-2"><TextInput value={label} onChange={setLabel} className="!p-2" disabled={readOnly} /></td>
      <td className="p-3 text-xs font-mono text-gray-500">{band.category}</td>
      <td className="p-2"><TextInput value={maxKg} onChange={setMaxKg} type="number" step="0.1" className="!p-2" disabled={readOnly} /></td>
      <td className="p-2"><TextInput value={multiplier} onChange={setMultiplier} type="number" step="0.01" className="!p-2" disabled={readOnly} /></td>
      <td className="p-3">{!readOnly && <BtnPrimary onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</BtnPrimary>}</td>
    </tr>
  );
}
