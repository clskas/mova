"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AdminProvider, useAdmin } from "@/components/AdminProvider";
import {
  CalendarIcon,
  CarpoolIcon,
  DeliveriesIcon,
  DriversIcon,
  IncidentsIcon,
  KycIcon,
  LocationsIcon,
  MetricsIcon,
  MovingIcon,
  PricingIcon,
  RestaurantsIcon,
  RidesIcon,
  SettingsIcon,
  SubscriptionIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/AdminIcons";
import { DemoBadge } from "@/components/ui";
import { checkGatewayHealth } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { navForRole, ROLE_LABELS, roleBadgeClass, canWriteSection, type NavItem } from "@/lib/rbac";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/": MetricsIcon,
  "/utilisateurs": UsersIcon,
  "/chauffeurs": DriversIcon,
  "/kyc": KycIcon,
  "/courses": RidesIcon,
  "/livraisons": DeliveriesIcon,
  "/restaurants": RestaurantsIcon,
  "/tarifs": PricingIcon,
  "/abonnements": SubscriptionIcon,
  "/portefeuille": WalletIcon,
  "/litiges": IncidentsIcon,
  "/planifiees": CalendarIcon,
  "/parametres": SettingsIcon,
  "/locations": LocationsIcon,
  "/demenagements": MovingIcon,
  "/covoiturage": CarpoolIcon,
};

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demo, setDemo] = useState(false);
  const { role, loading, user } = useAdmin();

  useEffect(() => {
    checkGatewayHealth().then((ok) => setDemo(!ok && !getToken()));
  }, []);

  const nav: NavItem[] = role ? navForRole(role) : [];
  const hasWriteAccess = role ? nav.some((item) => canWriteSection(role, item.section)) : false;

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <button type="button" className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fermer menu" />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#1A1A2E] text-white flex flex-col transform transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" width={36} height={36} className="rounded-lg" />
            <div>
              <p className="font-semibold">MOVA Admin</p>
              <p className="text-xs opacity-60">RDC · nationwide</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-white/50 px-3 py-2">Chargement menu…</p>
          ) : (
            nav.map(({ href, label }) => {
              const Icon = ICONS[href] ?? MetricsIcon;
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    active ? "bg-[#6C63FF] text-white font-medium" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              );
            })
          )}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <button type="button" className="lg:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-3 ml-auto">
            {role && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleBadgeClass(role)}`}>
                {ROLE_LABELS[role]}
              </span>
            )}
            {role && !loading && (
              <span className={`text-xs px-2.5 py-1 rounded-full hidden sm:inline ${hasWriteAccess ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                {hasWriteAccess ? "CRUD actif" : "Lecture seule"}
              </span>
            )}
            {user?.firstName && (
              <span className="text-sm text-gray-600 hidden sm:inline">
                {user.firstName} {user.lastName ?? ""}
              </span>
            )}
            <DemoBadge show={demo} />
            <button
              type="button"
              onClick={() => { clearToken(); window.location.href = "/login"; }}
              className="text-sm text-gray-500 hover:text-[#6C63FF] underline"
            >
              Déconnexion
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AdminProvider>
        <ShellInner>{children}</ShellInner>
      </AdminProvider>
    </AuthGate>
  );
}
