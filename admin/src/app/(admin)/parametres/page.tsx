"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCommunes,
  createCommune,
  deleteCommune,
  updateCommune,
  fetchProvinces,
  createProvince,
  updateProvince,
  deleteProvince,
  fetchCities,
  createCity,
  updateCity,
  deleteCity,
  type Commune,
  type Province,
  type AdminCity,
} from "@/lib/api";
import { useAdmin } from "@/components/AdminProvider";
import {
  BtnPrimary,
  Card,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  LoadingState,
  Modal,
  PageHeader,
  TextInput,
} from "@/components/ui";

type Tab = "provinces" | "cities" | "communes";

export default function ParametresPage() {
  const { canWrite } = useAdmin();
  const readOnly = !canWrite("parametres");
  const [tab, setTab] = useState<Tab>("provinces");

  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<AdminCity[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);

  const [selectedProvinceId, setSelectedProvinceId] = useState("");
  const [selectedCityName, setSelectedCityName] = useState("Kinshasa");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState<"province" | "city" | "commune" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const loadProvinces = useCallback(async () => {
    const data = await fetchProvinces();
    setProvinces(data);
    if (!selectedProvinceId && data.length > 0) setSelectedProvinceId(data[0].id);
  }, [selectedProvinceId]);

  const loadCities = useCallback(async (allCities = false) => {
    const data = await fetchCities(allCities ? undefined : selectedProvinceId || undefined);
    setCities(data);
    return data;
  }, [selectedProvinceId]);

  const loadCommunesForCity = useCallback(async (cityName: string) => {
    setCommunes(await fetchCommunes(cityName));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "provinces") await loadProvinces();
      if (tab === "cities") {
        await loadProvinces();
        await loadCities();
      }
      if (tab === "communes") {
        const allCities = await loadCities(true);
        const cityName =
          allCities.some((c) => c.name === selectedCityName)
            ? selectedCityName
            : allCities[0]?.name ?? selectedCityName;
        if (cityName !== selectedCityName) setSelectedCityName(cityName);
        await loadCommunesForCity(cityName);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [tab, loadProvinces, loadCities, loadCommunesForCity, selectedCityName]);

  useEffect(() => {
    load();
  }, [load]);

  function openModal(kind: typeof modal, defaults: Record<string, string>, id: string | null = null) {
    setModal(kind);
    setEditingId(id);
    setForm(defaults);
  }

  function closeModal() {
    setModal(null);
    setEditingId(null);
    setForm({});
  }

  async function saveProvince() {
    setSaving(true);
    try {
      if (editingId) await updateProvince(editingId, form.name);
      else await createProvince(form.name);
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function saveCity() {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        provinceId: form.provinceId,
        centerLat: Number(form.centerLat),
        centerLng: Number(form.centerLng),
        isActive: form.isActive !== "false",
      };
      if (editingId) await updateCity(editingId, payload);
      else await createCity(payload);
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function saveCommune() {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        city: selectedCityName,
        lat: Number(form.lat),
        lng: Number(form.lng),
      };
      if (editingId) await updateCommune(editingId, payload);
      else await createCommune(payload);
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Zones géographiques"
        subtitle="Provinces, villes et communes/quartiers MOVA"
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {(["provinces", "cities", "communes"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              tab === t ? "bg-violet-100 border-violet-400 text-violet-800" : "border-gray-200"
            }`}
          >
            {t === "provinces" ? "Provinces" : t === "cities" ? "Villes" : "Communes"}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {!readOnly && (
        <div className="mb-4">
          {tab === "provinces" && (
            <BtnPrimary onClick={() => openModal("province", { name: "" })}>+ Province</BtnPrimary>
          )}
          {tab === "cities" && (
            <BtnPrimary
              onClick={() =>
                openModal("city", {
                  name: "",
                  slug: "",
                  provinceId: selectedProvinceId || provinces[0]?.id || "",
                  centerLat: "-4.32",
                  centerLng: "15.31",
                  isActive: "true",
                })
              }
            >
              + Ville
            </BtnPrimary>
          )}
          {tab === "communes" && (
            <BtnPrimary
              onClick={() =>
                openModal("commune", { name: "", lat: "-4.32", lng: "15.31" })
              }
            >
              + Commune
            </BtnPrimary>
          )}
        </div>
      )}

      {tab === "cities" && (
        <div className="mb-4 flex flex-wrap gap-2">
          {provinces.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvinceId(p.id)}
              className={`px-3 py-1 rounded-full text-sm border ${
                selectedProvinceId === p.id ? "bg-violet-100 border-violet-400" : "border-gray-200"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {tab === "communes" && (
        <div className="mb-4 flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelectedCityName(c.name);
                loadCommunesForCity(c.name);
              }}
              className={`px-3 py-1 rounded-full text-sm border ${
                selectedCityName === c.name ? "bg-violet-100 border-violet-400" : "border-gray-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : tab === "provinces" ? (
        provinces.length === 0 ? (
          <EmptyState message="Aucune province" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-3">Province</th>
                  <th className="p-3">Villes</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {provinces.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{p._count?.cities ?? 0}</td>
                    <td className="p-3 space-x-2">
                      <button
                        type="button"
                        className="text-[#6C63FF] hover:underline"
                        onClick={() => openModal("province", { name: p.name }, p.id)}
                      >
                        {readOnly ? "Voir" : "Modifier"}
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={async () => {
                            if (!confirm("Supprimer cette province ?")) return;
                            await deleteProvince(p.id);
                            load();
                          }}
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : tab === "cities" ? (
        cities.length === 0 ? (
          <EmptyState message="Aucune ville pour cette province" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="p-3">Ville</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Centre GPS</th>
                  <th className="p-3">Active</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 font-mono text-xs">{c.slug}</td>
                    <td className="p-3 text-gray-500 font-mono text-xs">
                      {c.centerLat.toFixed(4)}, {c.centerLng.toFixed(4)}
                    </td>
                    <td className="p-3">{c.isActive ? "Oui" : "Non"}</td>
                    <td className="p-3 space-x-2">
                      <button
                        type="button"
                        className="text-[#6C63FF] hover:underline"
                        onClick={() =>
                          openModal(
                            "city",
                            {
                              name: c.name,
                              slug: c.slug,
                              provinceId: c.provinceId,
                              centerLat: String(c.centerLat),
                              centerLng: String(c.centerLng),
                              isActive: String(c.isActive),
                            },
                            c.id,
                          )
                        }
                      >
                        {readOnly ? "Voir" : "Modifier"}
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={async () => {
                            if (!confirm("Supprimer cette ville ?")) return;
                            await deleteCity(c.id);
                            load();
                          }}
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : communes.length === 0 ? (
        <EmptyState message={`Aucune commune pour ${selectedCityName}`} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Ville</th>
                <th className="p-3">Coordonnées</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {communes.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.city ?? selectedCityName}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">
                    {c.lat?.toFixed(4)}, {c.lng?.toFixed(4)}
                  </td>
                  <td className="p-3 space-x-2">
                    <button
                      type="button"
                      className="text-[#6C63FF] hover:underline"
                      onClick={() =>
                        openModal(
                          "commune",
                          { name: c.name, lat: String(c.lat ?? ""), lng: String(c.lng ?? "") },
                          c.id,
                        )
                      }
                    >
                      {readOnly ? "Voir" : "Modifier"}
                    </button>
                    {!readOnly && c.id && !c.id.includes("-") && (
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={async () => {
                          if (!confirm("Supprimer cette commune ?")) return;
                          await deleteCommune(c.id);
                          load();
                        }}
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={modal != null}
        onClose={closeModal}
        title={
          modal === "province"
            ? editingId
              ? "Modifier province"
              : "Nouvelle province"
            : modal === "city"
              ? editingId
                ? "Modifier ville"
                : "Nouvelle ville"
              : editingId
                ? "Modifier commune"
                : "Nouvelle commune"
        }
      >
        {modal === "province" && (
          <div className="space-y-4">
            <label>
              <FieldLabel>Nom</FieldLabel>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} disabled={readOnly} />
            </label>
            {!readOnly && (
              <BtnPrimary onClick={saveProvince} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </BtnPrimary>
            )}
          </div>
        )}
        {modal === "city" && (
          <div className="space-y-4">
            <label>
              <FieldLabel>Nom</FieldLabel>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} disabled={readOnly} />
            </label>
            <label>
              <FieldLabel>Slug (id technique)</FieldLabel>
              <TextInput value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} disabled={readOnly} />
            </label>
            <label>
              <FieldLabel>Province</FieldLabel>
              <select
                className="w-full border rounded-lg p-2"
                value={form.provinceId}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, provinceId: e.target.value })}
              >
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <FieldLabel>Latitude</FieldLabel>
                <TextInput value={form.centerLat} onChange={(v) => setForm({ ...form, centerLat: v })} disabled={readOnly} />
              </label>
              <label>
                <FieldLabel>Longitude</FieldLabel>
                <TextInput value={form.centerLng} onChange={(v) => setForm({ ...form, centerLng: v })} disabled={readOnly} />
              </label>
            </div>
            {!readOnly && (
              <BtnPrimary onClick={saveCity} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </BtnPrimary>
            )}
          </div>
        )}
        {modal === "commune" && (
          <div className="space-y-4">
            <label>
              <FieldLabel>Nom</FieldLabel>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} disabled={readOnly} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <FieldLabel>Latitude</FieldLabel>
                <TextInput value={form.lat} onChange={(v) => setForm({ ...form, lat: v })} disabled={readOnly} />
              </label>
              <label>
                <FieldLabel>Longitude</FieldLabel>
                <TextInput value={form.lng} onChange={(v) => setForm({ ...form, lng: v })} disabled={readOnly} />
              </label>
            </div>
            {!readOnly && (
              <BtnPrimary onClick={saveCommune} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </BtnPrimary>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
