"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import { GpsCoordButton } from "@/components/GpsCoordButton";
import { fetchProfile, updateRentalBusiness } from "@/lib/api";
import { MOVA_CITIES } from "@/lib/mova-cities";
import { toUserErrorMessage } from "@/lib/user-messages";
import {
  playPartnerAlertChime,
  setPartnerSoundMuted,
  setPartnerSoundStyle,
  subscribePartnerAlertUi,
  unlockPartnerAlerts,
  type PartnerSoundStyle,
} from "@/lib/partner-alerts";

function parseCoord(value: string): number | null {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function ParametresPage() {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("Kinshasa");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canOperate, setCanOperate] = useState(true);
  const [soundMuted, setSoundMuted] = useState(false);
  const [soundStyle, setSoundStyle] = useState<PartnerSoundStyle>("senga");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(true);
  const [soundTesting, setSoundTesting] = useState(false);

  useEffect(() => {
    return subscribePartnerAlertUi((ui) => {
      setSoundMuted(ui.soundMuted);
      setSoundStyle(ui.soundStyle);
      setSoundEnabled(ui.soundEnabled);
      setNeedsUnlock(ui.needsUnlock);
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const p = await fetchProfile();
      setBusinessName(p.businessName && p.businessName !== "Ma location" ? p.businessName : p.name ?? "");
      setCity(p.city && p.city !== "À préciser" ? p.city : "Kinshasa");
      setAddress(p.address && p.address !== "Kinshasa — à compléter" ? p.address : "");
      setLat(p.lat != null ? String(p.lat) : "");
      setLng(p.lng != null ? String(p.lng) : "");
      setCanOperate(p.canOperate !== false && p.kycStatus !== "PENDING" && p.kycStatus !== "REJECTED");
    } catch (e) {
      setError(toUserErrorMessage(e, "Erreur"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const latNum = parseCoord(lat);
      const lngNum = parseCoord(lng);
      if (lat.trim() && latNum == null) throw new Error("Latitude invalide");
      if (lng.trim() && lngNum == null) throw new Error("Longitude invalide");
      if ((latNum != null && lngNum == null) || (latNum == null && lngNum != null)) {
        throw new Error("Renseignez latitude et longitude ensemble.");
      }
      if (!businessName.trim() || !city.trim() || !address.trim()) {
        throw new Error("Renseignez le nom, la ville et l'adresse.");
      }
      await updateRentalBusiness({
        businessName: businessName.trim(),
        city: city.trim(),
        address: address.trim(),
        ...(latNum != null && lngNum != null ? { lat: latNum, lng: lngNum } : {}),
      });
      setMessage("Paramètres enregistrés");
      await load();
    } catch (e) {
      setError(toUserErrorMessage(e, "Échec"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-xl font-bold">Paramètres</h2>
      <p className="text-sm text-gray-500">
        Modifiez les informations de votre activité de location. Besoin d&apos;aide ? Ouvrez le{" "}
        <a href="/manuel" className="text-indigo-700 underline font-medium">
          Manuel utilisateur
        </a>{" "}
        ou les{" "}
        <a href="/aide" className="text-indigo-700 underline font-medium">
          Contacts
        </a>
        .
      </p>
      {!canOperate && (
        <p className="text-sm text-amber-900 bg-amber-50 rounded-xl px-3 py-2">
          Votre dossier n&apos;est pas encore validé. Vous ne pouvez pas publier de véhicules — ouvrez{" "}
          <a href="/dossier" className="underline font-medium">
            Mon dossier
          </a>
          .
        </p>
      )}
      <ConnectionCard />
      {loading ? (
        <p className="text-gray-400">Chargement…</p>
      ) : (
        <div className="bg-white rounded-2xl border p-6 space-y-5">
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-gray-700">Fiche activité de location</h3>
            <label className="block text-sm">
              <span className="text-gray-600">Nom de l&apos;agence / activité</span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                placeholder="Ex. SENGA Fleet Kinshasa"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Ville principale</span>
              <select
                className="mt-1 w-full rounded-xl border p-3 bg-white"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {MOVA_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Adresse</span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                placeholder="Ex. Gombe, Kinshasa"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">Latitude</span>
                <input
                  className="mt-1 w-full rounded-xl border p-3 font-mono text-sm"
                  placeholder="-4.3217"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Longitude</span>
                <input
                  className="mt-1 w-full rounded-xl border p-3 font-mono text-sm"
                  placeholder="15.3125"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                />
              </label>
            </div>
            <GpsCoordButton
              onCoords={(nextLat, nextLng) => {
                setLat(nextLat);
                setLng(nextLng);
                setError(null);
              }}
              onError={setError}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      )}

      {!loading && (
        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <h3 className="font-semibold text-sm text-gray-700">Son des notifications</h3>
          <p className="text-xs text-gray-500">
            Alertes pour les nouvelles demandes de location. Le navigateur peut exiger un clic pour
            autoriser le son.
          </p>
          {needsUnlock && (
            <button
              type="button"
              onClick={() => void unlockPartnerAlerts({ fromBanner: true })}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium"
            >
              Activer le son du navigateur
            </button>
          )}
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">
              Son des alertes
              <span className="block text-xs text-gray-400">
                {soundMuted
                  ? "Coupé (toasts sans bip)"
                  : needsUnlock
                    ? "Autorisation navigateur requise"
                    : "Activé"}
              </span>
            </span>
            <input
              type="checkbox"
              className="w-5 h-5"
              checked={!soundMuted}
              onChange={(e) => {
                const on = e.target.checked;
                setPartnerSoundMuted(!on);
                if (on) {
                  void unlockPartnerAlerts({ fromBanner: true });
                }
              }}
            />
          </label>
          <fieldset className="space-y-2" disabled={soundMuted}>
            <legend className="text-sm text-gray-600 mb-1">Choix du son</legend>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="partner-sound-style"
                checked={soundStyle === "senga"}
                onChange={() => setPartnerSoundStyle("senga")}
              />
              Son SENGA Partenaire
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="partner-sound-style"
                checked={soundStyle === "chime"}
                onChange={() => setPartnerSoundStyle("chime")}
              />
              Mélodie courte (navigateur)
            </label>
          </fieldset>
          <button
            type="button"
            disabled={soundTesting || soundMuted}
            onClick={async () => {
              setSoundTesting(true);
              try {
                if (needsUnlock || !soundEnabled) {
                  await unlockPartnerAlerts({ fromBanner: true });
                } else {
                  await playPartnerAlertChime();
                }
              } finally {
                setSoundTesting(false);
              }
            }}
            className="w-full py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-medium disabled:opacity-60"
          >
            {soundTesting ? "Test…" : "Tester le son"}
          </button>
        </div>
      )}
    </div>
  );
}
