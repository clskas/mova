"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Metrics = {
  totalUsers?: number;
  activeDrivers?: number;
  ridesToday?: number;
  revenueTodayCdf?: number;
};

export default function AdminDashboard() {
  const [tab, setTab] = useState<"metrics" | "users" | "kyc" | "incidents">("metrics");
  const [metrics, setMetrics] = useState<Metrics>({});
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [kyc, setKyc] = useState<Record<string, unknown>[]>([]);
  const [incidents, setIncidents] = useState<Record<string, unknown>[]>([]);
  const [mock, setMock] = useState(false);

  useEffect(() => {
    load();
  }, [tab]);

  async function load() {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
      const health = await fetch(`${base}/health`);
      setMock(!health.ok);
    } catch {
      setMock(true);
    }

    if (tab === "metrics") setMetrics(await apiFetch("/api/admin/metrics"));
    if (tab === "users") setUsers(await apiFetch("/api/admin/users"));
    if (tab === "kyc") setKyc(await apiFetch("/api/admin/kyc/pending"));
    if (tab === "incidents") setIncidents(await apiFetch("/api/admin/incidents"));
  }

  async function reviewKyc(id: string, approved: boolean) {
    await apiFetch(`/api/admin/kyc/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    });
    load();
  }

  async function resolveIncident(id: string) {
    await apiFetch(`/api/admin/incidents/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status: "RESOLVED" }),
    });
    load();
  }

  const tabs = [
    { id: "metrics" as const, label: "Métriques" },
    { id: "users" as const, label: "Utilisateurs" },
    { id: "kyc" as const, label: "KYC" },
    { id: "incidents" as const, label: "Litiges" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#1A1A2E] text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">MOVA Admin</h1>
        {mock && <span className="text-xs bg-[#FF6B35] px-2 py-1 rounded">Mode démo</span>}
      </header>

      <nav className="flex gap-1 bg-white border-b px-4 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm whitespace-nowrap ${
              tab === t.id ? "text-[#6C63FF] border-b-2 border-[#6C63FF] font-medium" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {tab === "metrics" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ["Utilisateurs", metrics.totalUsers],
              ["Chauffeurs actifs", metrics.activeDrivers],
              ["Courses aujourd'hui", metrics.ridesToday],
              ["Revenus (FC)", metrics.revenueTodayCdf?.toLocaleString("fr-CD")],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-[#6C63FF]">{val ?? "—"}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "users" && (
          <table className="w-full bg-white rounded-xl shadow-sm text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-3">Nom</th>
                <th className="p-3">Téléphone</th>
                <th className="p-3">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id as string} className="border-b">
                  <td className="p-3">{u.name as string}</td>
                  <td className="p-3">{u.phone as string}</td>
                  <td className="p-3">{u.role as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "kyc" && (
          <div className="space-y-3">
            {kyc.map((k) => (
              <div key={k.id as string} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-center gap-4">
                <div>
                  <p className="font-medium">{k.type as string}</p>
                  <p className="text-sm text-gray-500">Utilisateur {k.userId as string}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => reviewKyc(k.id as string, true)} className="px-3 py-1 bg-[#00D4A1] text-white rounded-lg text-sm">Approuver</button>
                  <button onClick={() => reviewKyc(k.id as string, false)} className="px-3 py-1 bg-[#FF6B35] text-white rounded-lg text-sm">Rejeter</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "incidents" && (
          <div className="space-y-3">
            {incidents.map((i) => (
              <div key={i.id as string} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-start gap-4">
                <div>
                  <p className="font-medium">{i.type as string}</p>
                  <p className="text-sm">{i.description as string}</p>
                  <p className="text-xs text-gray-400">{i.status as string}</p>
                </div>
                <button onClick={() => resolveIncident(i.id as string)} className="px-3 py-1 bg-[#6C63FF] text-white rounded-lg text-sm shrink-0">
                  Résoudre
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
