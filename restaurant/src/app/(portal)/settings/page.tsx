"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchProfile, updateMenuSettings, updateRestaurantLocation } from "@/lib/api";
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
              <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} className="w-5 h-5" />
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
    </div>
  );
}
