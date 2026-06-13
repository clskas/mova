"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCommunes, type Commune } from "@/lib/api";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

export default function ParametresPage() {
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommunes(await fetchCommunes());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Communes" subtitle="Référentiel géographique Kinshasa · lecture seule (seed backend)" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? (
        <LoadingState />
      ) : communes.length === 0 ? (
        <EmptyState message="Aucune commune" />
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
                  <td className="p-3">{c.city ?? "Kinshasa"}</td>
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
