"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  checkGatewayHealth,
  formatUserName,
  normalizeMetrics,
  type AdminMetrics,
  type AdminUser,
  type DeliveryOverview,
  type Incident,
  type KycItem,
  type ScheduledOverview,
} from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { clearToken, getToken } from "@/lib/auth";
import {
  DeliveriesIcon,
  IncidentsIcon,
  KycIcon,
  MetricsIcon,
  UsersIcon,
} from "@/components/AdminIcons";

type Tab = "metrics" | "users" | "kyc" | "incidents" | "operations";

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("metrics");
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [kyc, setKyc] = useState<KycItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOverview[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledOverview[]>([]);
  const [search, setSearch] = useState("");
  const [mock, setMock] = useState(false);

  const load = useCallback(async () => {
    const online = await checkGatewayHealth();
    setMock(!online && !getToken());

    try {
      if (tab === "metrics") setMetrics(await apiFetch<AdminMetrics>("/api/admin/metrics"));
      if (tab === "users") setUsers(await apiFetch<AdminUser[]>("/api/admin/users"));
      if (tab === "kyc") setKyc(await apiFetch<KycItem[]>("/api/admin/kyc/pending"));
      if (tab === "incidents") setIncidents(await apiFetch<Incident[]>("/api/admin/incidents"));
      if (tab === "operations") {
        const [d, s] = await Promise.all([
          apiFetch<DeliveryOverview[]>("/api/admin/deliveries"),
          apiFetch<ScheduledOverview[]>("/api/admin/scheduled-rides"),
        ]);
        setDeliveries(Array.isArray(d) ? d : []);
        setScheduled(Array.isArray(s) ? s : []);
      }
    } catch {
      if (!getToken()) setMock(true);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

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

  const m = normalizeMetrics(metrics);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const tabs = [
    { id: "metrics" as const, label: "Métriques", icon: MetricsIcon },
    { id: "users" as const, label: "Utilisateurs", icon: UsersIcon },
    { id: "kyc" as const, label: "KYC", icon: KycIcon },
    { id: "incidents" as const, label: "Litiges", icon: IncidentsIcon },
    { id: "operations" as const, label: "Livraisons & Planifiées", icon: DeliveriesIcon },
  ];

  return (
    <AuthGate>
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#1A1A2E] text-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="" width={32} height={32} className="rounded-md" />
          <div>
          <h1 className="text-xl font-semibold">MOVA Admin</h1>
          <p className="text-xs opacity-70">{m.city} · nationwide RDC</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mock && <span className="text-xs bg-[#FF6B35] px-2 py-1 rounded">Mode démo</span>}
          <button
            type="button"
            onClick={() => { clearToken(); window.location.href = "/login"; }}
            className="text-xs opacity-80 hover:opacity-100 underline"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <nav className="flex gap-1 bg-white border-b px-4 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap ${
                tab === t.id ? "text-[#6C63FF] border-b-2 border-[#6C63FF] font-medium" : "text-gray-500"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {tab === "metrics" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ["Utilisateurs", m.totalUsers],
              ["Chauffeurs actifs", m.activeDrivers],
              ["Courses aujourd'hui", m.ridesToday],
              ["Revenus (FC)", m.revenueTodayCdf.toLocaleString("fr-CD")],
              ["Litiges ouverts", m.openIncidents],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-[#6C63FF]">{val ?? "—"}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "users" && (
          <div className="space-y-4">
            <input
              className="w-full max-w-sm rounded-xl border-0 bg-white p-3 shadow-sm"
              placeholder="Rechercher par nom, téléphone ou rôle…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="p-3">Nom</th>
                    <th className="p-3">Téléphone</th>
                    <th className="p-3">Rôle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan={3} className="p-6 text-center text-gray-400">Aucun résultat</td></tr>
                  ) : filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b">
                      <td className="p-3">{formatUserName(u)}</td>
                      <td className="p-3">{u.phone}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${u.role === "DRIVER" ? "bg-green-100 text-green-700" : "bg-violet-100 text-violet-700"}`}>
                          {u.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "kyc" && (
          <div className="space-y-3">
            {kyc.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Aucun KYC en attente</p>
            ) : kyc.map((k) => (
              <div key={k.id} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-center gap-4 flex-wrap">
                <div>
                  <p className="font-medium">{k.type}</p>
                  <p className="text-sm text-gray-500">Utilisateur {k.userId}</p>
                  <p className="text-xs text-gray-400">{k.status}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => reviewKyc(k.id, true)} className="px-3 py-1 bg-[#00D4A1] text-white rounded-lg text-sm">Approuver</button>
                  <button onClick={() => reviewKyc(k.id, false)} className="px-3 py-1 bg-[#FF6B35] text-white rounded-lg text-sm">Rejeter</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "incidents" && (
          <div className="space-y-3">
            {incidents.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Aucun litige</p>
            ) : incidents.map((i) => (
              <div key={i.id} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-start gap-4">
                <div>
                  <p className="font-medium">{i.type}</p>
                  <p className="text-sm">{i.description}</p>
                  <p className="text-xs text-gray-400">{i.status}</p>
                </div>
                {i.status === "OPEN" && (
                  <button onClick={() => resolveIncident(i.id)} className="px-3 py-1 bg-[#6C63FF] text-white rounded-lg text-sm shrink-0">
                    Résoudre
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "operations" && (
          <div className="space-y-6">
            <section>
              <h3 className="font-semibold mb-3">Livraisons en cours</h3>
              <div className="space-y-3">
                {deliveries.length === 0 ? (
                  <p className="text-gray-400 text-sm">Aucune livraison</p>
                ) : deliveries.map((d) => (
                  <div key={d.id} className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex justify-between items-start">
                      <p className="font-medium">{d.type === "FOOD" ? `🍽️ ${d.restaurantName}` : `📦 ${d.pickupAddress} → ${d.dropoffAddress}`}</p>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{d.status}</span>
                    </div>
                    <p className="text-sm text-[#6C63FF]">{(d.priceCdf ?? 0).toLocaleString("fr-CD")} FC</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="font-semibold mb-3">Courses planifiées</h3>
              <div className="space-y-3">
                {scheduled.length === 0 ? (
                  <p className="text-gray-400 text-sm">Aucune réservation planifiée</p>
                ) : scheduled.map((s) => (
                  <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="font-medium">{s.pickupAddress} → {s.dropoffAddress}</p>
                    <p className="text-sm text-gray-500">
                      {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString("fr-CD") : "—"}
                    </p>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">{s.status}</span>
                      <span className="text-sm text-[#6C63FF]">{(s.priceCdf ?? 0).toLocaleString("fr-CD")} FC</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
    </AuthGate>
  );
}
