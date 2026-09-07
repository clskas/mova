"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import {
  addRestaurantDriver,
  fetchProfile,
  fetchRestaurantDrivers,
  removeRestaurantDriver,
  updateCourierMode,
  updateMenuSettings,
  updateRestaurantLocation,
  type CourierMode,
  type RestaurantFleetDriver,
} from "@/lib/api";
import { toUserErrorMessage } from "@/lib/user-messages";

export default function SettingsPage() {
  const [accepting, setAccepting] = useState(true);
  const [prepTime, setPrepTime] = useState(25);
  const [promo, setPromo] = useState("");
  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courierMode, setCourierMode] = useState<CourierMode>("PLATFORM");
  const [drivers, setDrivers] = useState<RestaurantFleetDriver[]>([]);
  const [driverPhone, setDriverPhone] = useState("");
  const [fleetBusy, setFleetBusy] = useState(false);
  const [canOperate, setCanOperate] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await fetchProfile();
      setAccepting(p.isAcceptingOrders ?? true);
      setPrepTime(p.prepTimeMin ?? 25);
      setPromo("");
      setName(p.name ?? "");
      setCuisine(p.cuisine ?? "");
      setAddress(p.address ?? "");
      setLat(p.lat != null ? String(p.lat) : "");
      setLng(p.lng != null ? String(p.lng) : "");
      setCourierMode((p.courierMode as CourierMode) ?? "PLATFORM");
      setCanOperate(p.canOperate !== false && p.kycStatus !== "PENDING" && p.kycStatus !== "REJECTED");
      try {
        const fleet = await fetchRestaurantDrivers();
        setDrivers(fleet.drivers ?? []);
        if (fleet.courierMode) setCourierMode(fleet.courierMode);
      } catch {
        /* flotte optionnelle */
      }
    } catch (e) {
      setError(toUserErrorMessage(e, "Erreur"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function parseCoord(value: string): number | null {
    const n = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("La géolocalisation nécessite HTTPS ou localhost (pas une IP http://).");
      return;
    }
    setLocating(true);
    setError(null);
    const onSuccess = (pos: GeolocationPosition) => {
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
      setLocating(false);
    };
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            () => {
              setError("Impossible d'obtenir votre position GPS.");
              setLocating(false);
            },
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
          );
          return;
        }
        setError("Impossible d'obtenir votre position GPS. Autorisez la localisation.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

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
      await updateMenuSettings({
        isAcceptingOrders: accepting,
        prepTimeMin: prepTime,
        promotionLabel: promo.trim() || undefined,
      });
      if (address.trim() || name.trim() || cuisine.trim() || latNum != null) {
        await updateRestaurantLocation({
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(cuisine.trim() ? { cuisine: cuisine.trim() } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(latNum != null && lngNum != null ? { lat: latNum, lng: lngNum } : {}),
        });
      }
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
          Besoin d&apos;aide ? Ouvrez le{" "}
          <a href="/aide" className="text-orange-700 underline font-medium">
            Manuel
          </a>{" "}
          ou les{" "}
          <a href="/aide" className="text-orange-700 underline font-medium">
            Contacts
          </a>
          .
        </p>
        {!canOperate && (
          <p className="text-sm text-amber-900 bg-amber-50 rounded-xl px-3 py-2">
            Votre dossier n&apos;est pas encore validé. Vous ne pouvez pas accepter de commandes — ouvrez{" "}
            <a href="/dossier" className="underline font-medium">Mon dossier</a>.
          </p>
        )}
        <ConnectionCard />
        {loading ? (
          <p className="text-gray-400">Chargement…</p>
        ) : (
          <div className="bg-white rounded-2xl border p-6 space-y-5">
            <div className="space-y-3 pb-4 border-b">
              <h3 className="font-semibold text-sm text-gray-700">Localisation du restaurant</h3>
              <label className="block text-sm">
                <span className="text-gray-600">Nom du restaurant</span>
                <input
                  className="mt-1 w-full rounded-xl border p-3"
                  placeholder="Ex. Chez Flore"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Cuisine</span>
                <input
                  className="mt-1 w-full rounded-xl border p-3"
                  placeholder="Ex. Congolais"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                />
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
              <button
                type="button"
                disabled={locating}
                onClick={useMyLocation}
                className="w-full py-2 rounded-xl border border-orange-200 text-orange-700 text-sm font-medium disabled:opacity-60"
              >
                {locating ? "Localisation…" : "Utiliser ma position GPS"}
              </button>
              <p className="text-xs text-gray-400">
                Les passagers voient les restaurants proches de leur adresse de livraison. Une position précise améliore votre visibilité.
              </p>
            </div>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm">Accepter les commandes</span>
              <input type="checkbox" checked={accepting} disabled={!canOperate} onChange={(e) => setAccepting(e.target.checked)} className="w-5 h-5" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Temps de préparation (minutes)</span>
              <input
                type="number"
                min={5}
                max={120}
                className="mt-1 w-full rounded-xl border p-3"
                value={prepTime}
                onChange={(e) => setPrepTime(Number(e.target.value))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Promotion (optionnel)</span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                placeholder="Ex. -10% aujourd'hui"
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="w-full py-3 rounded-xl bg-[#FF6B35] text-white font-medium disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {message && <p className="text-sm text-green-700">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-gray-400">
              Gérez les plats et photos dans l&apos;onglet <a href="/menu" className="text-orange-600 underline">Menu</a>.
            </p>
          </div>
        )}

        {!loading && (
          <div className="bg-white rounded-2xl border p-6 space-y-4">
            <h3 className="font-semibold text-sm text-gray-700">Livreurs du restaurant</h3>
            <p className="text-xs text-gray-500">
              Le client paie d&apos;abord (portefeuille ou Mobile Money) avant que vous prépariez.
              Vous êtes payé quand le plat part. Un livreur SENGA est payé après le code PIN du client.
              Si c&apos;est votre livreur, les frais de course restent au restaurant.
            </p>
            <label className="block text-sm">
              <span className="text-gray-600">Qui livre ?</span>
              <select
                className="mt-1 w-full rounded-xl border p-3"
                value={courierMode}
                disabled={fleetBusy}
                onChange={async (e) => {
                  const mode = e.target.value as CourierMode;
                  setFleetBusy(true);
                  setError(null);
                  try {
                    await updateCourierMode(mode);
                    setCourierMode(mode);
                  } catch (err) {
                    setError(toUserErrorMessage(err, "Impossible de changer le mode livreurs."));
                  } finally {
                    setFleetBusy(false);
                  }
                }}
              >
                <option value="PLATFORM">Livreurs SENGA uniquement</option>
                <option value="OWN">Mes livreurs uniquement</option>
                <option value="HYBRID">Mes livreurs d&apos;abord, puis SENGA</option>
              </select>
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border p-3 text-sm"
                placeholder="Téléphone livreur SENGA (+243…)"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
              />
              <button
                type="button"
                disabled={fleetBusy || !driverPhone.trim()}
                onClick={async () => {
                  setFleetBusy(true);
                  setError(null);
                  try {
                    await addRestaurantDriver({ phone: driverPhone.trim() });
                    setDriverPhone("");
                    const fleet = await fetchRestaurantDrivers();
                    setDrivers(fleet.drivers ?? []);
                  } catch (err) {
                    setError(toUserErrorMessage(err, "Livreur introuvable. Il doit déjà avoir un compte livreur SENGA."));
                  } finally {
                    setFleetBusy(false);
                  }
                }}
                className="px-4 rounded-xl bg-orange-600 text-white text-sm disabled:opacity-60"
              >
                Ajouter
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Ajoutez un livreur par son numéro. Il doit déjà être inscrit comme livreur dans l&apos;application SENGA.
            </p>
            {drivers.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun livreur interne. Les commandes iront aux livreurs SENGA si le mode le permet.</p>
            ) : (
              <ul className="space-y-2">
                {drivers.map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-sm border rounded-xl px-3 py-2">
                    <span className="text-sm">
                      {d.phone || d.name || "Livreur SENGA"}
                      {d.isActive ? "" : " (inactif)"}
                    </span>
                    <button
                      type="button"
                      disabled={fleetBusy}
                      onClick={async () => {
                        setFleetBusy(true);
                        try {
                          await removeRestaurantDriver(d.driverUserId);
                          setDrivers((prev) => prev.filter((x) => x.id !== d.id));
                        } catch (err) {
                          setError(toUserErrorMessage(err, "Retrait impossible."));
                        } finally {
                          setFleetBusy(false);
                        }
                      }}
                      className="text-red-600 text-xs"
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </div>
  );
}
