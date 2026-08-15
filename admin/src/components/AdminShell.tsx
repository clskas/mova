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
  FraudIcon,
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
  PublicitesIcon,
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
  "/publicites": PublicitesIcon,
  "/tarifs": PricingIcon,
  "/regles-plateforme": PricingIcon,
  "/abonnements": SubscriptionIcon,
  "/portefeuille": WalletIcon,
  "/litiges": IncidentsIcon,
  "/fraude": FraudIcon,
  "/planifiees": CalendarIcon,
  "/parametres": SettingsIcon,
  "/lieux": SettingsIcon,
  "/locations": LocationsIcon,
  "/catalogue-location": LocationsIcon,
  "/demenagements": MovingIcon,
  "/covoiturage": CarpoolIcon,
};

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [demo, setDemo] = useState(false);
  const { role, loading, user } = useAdmin();

  useEffect(() => {
    checkGatewayHealth().then((ok) => setDemo(!ok && !getToken()));
  }, []);

  const nav: NavItem[] = role ? navForRole(role) : [];
  const hasWriteAccess = role ? nav.some((item) => canWriteSection(role, item.section)) : false;

  return (
    <div className="min-h-screen flex overflow-x-hidden">
      <aside
        className="hidden lg:flex w-64 text-white flex-col overflow-hidden"
        style={{ background: "var(--sidebar-gradient)" }}
      >
        <div className="p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={36} height={36} className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">SENGA Admin</p>
              <p className="text-xs opacity-60">Couverture nationale RDC</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-white/50 px-3 py-2">Chargement menu…</p>
          ) : (
            <div className="space-y-0.5">
              {nav.map(({ href, label }) => {
                const Icon = ICONS[href] ?? MetricsIcon;
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm min-h-11 transition-colors ${
                      active ? "bg-[#6C63FF] text-white font-medium" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b pt-[env(safe-area-inset-top)]">
          <div className="px-3 lg:px-6 py-2 lg:py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md shrink-0" />
              <p className="font-semibold text-sm text-[#1A1A2E] truncate">SENGA Admin</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              {role && (
                <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full font-medium ${roleBadgeClass(role)}`}>
                  {ROLE_LABELS[role]}
                </span>
              )}
              {role && !loading && (
                <span className={`text-xs px-2.5 py-1 rounded-full hidden sm:inline ${hasWriteAccess ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                  {hasWriteAccess ? "Édition" : "Consultation"}
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
                className="text-xs sm:text-sm text-gray-500 hover:text-[#6C63FF] underline min-h-10 px-1"
              >
                Déconnexion
              </button>
            </div>
          </div>
          <nav className="lg:hidden grid grid-cols-5 gap-0.5 px-1.5 pb-1.5">
            {loading ? (
              <p className="col-span-5 text-xs text-gray-400 px-2 py-2">Chargement menu…</p>
            ) : (
              nav.map(({ href, label, short }) => {
                const Icon = ICONS[href] ?? MetricsIcon;
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    title={label}
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-10 rounded-lg text-[9px] leading-tight text-center px-0.5 ${
                      active ? "bg-[#6C63FF] text-white font-semibold" : "text-gray-600"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="line-clamp-1">{short}</span>
                  </Link>
                );
              })
            )}
          </nav>
        </header>
        <main className="flex-1 p-3 lg:p-6 overflow-x-auto pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</main>
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
