"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCommunes, type Commune } from "@/lib/api";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

const SERVICE_AREAS = [
  "Kinshasa", "Lubumbashi", "Goma", "Bukavu", "Kisangani", "Mbuji-Mayi", "Kananga",
  "Matadi", "Boma", "Kolwezi", "Likasi", "Tshikapa", "Mbandaka", "Kindu", "Bunia",
  "Butembo", "Beni", "Uvira", "Kalemie", "Kamina", "Gbadolite", "Gemena", "Boende",
  "Lisala", "Isiro", "Buta", "Inongo", "Bandundu", "Kikwit", "Kenge", "Kabinda", "Lusambo",
];

export default function ParametresPage() {
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [city, setCity] = useState("Kinshasa");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommunes(await fetchCommunes(city));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Zones & communes"
        subtitle={`${SERVICE_AREAS.length} villes actives · quartiers seed par ville`}
      />
      <Card className="p-4 mb-4">
        <p className="text-sm text-gray-600 mb-2">Villes desservies</p>
        <p className="text-sm">{SERVICE_AREAS.join(" · ")}</p>
      </Card>
      <div className="mb-4 flex flex-wrap gap-2">
        {["Kinshasa", "Lubumbashi", "Goma"].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCity(c)}
            className={`px-3 py-1 rounded-full text-sm border ${city === c ? "bg-violet-100 border-violet-400" : "border-gray-200"}`}
          >
            {c}
          </button>
        ))}
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : communes.length === 0 ? (
        <EmptyState message="Aucune commune pour cette ville" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Ville</th>
                <th className="p-3">Coordonnées</th>
              </tr>
            </thead>
            <tbody>
              {communes.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.city ?? city}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">
                    {c.lat?.toFixed(4)}, {c.lng?.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
