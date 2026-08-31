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
        data-desktop-nav
        className="senga-nav-desktop w-64 text-white flex-col overflow-hidden"
        style={{ background: "var(--sidebar-gradient)" }}
      >
        <div className="p-5 border-b border-white/10 shrink-0">
          <div className="flex flex-col items-center text-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={36} height={36} className="rounded-lg" />
            <div className="min-w-0 w-full">
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
        <header className="bg-white border-b overflow-x-hidden pt-[env(safe-area-inset-top)]">
          <div className="px-3 lg:px-6 py-2 lg:py-3 flex flex-col items-center lg:items-stretch gap-2">
            <div className="flex flex-col items-center text-center mx-auto min-w-0 w-full lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md" />
              <p className="font-semibold text-sm text-[#1A1A2E] truncate max-w-full">SENGA Admin</p>
              {user?.firstName && (
                <p className="text-xs text-gray-600 truncate max-w-full">
                  {user.firstName} {user.lastName ?? ""}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center lg:justify-end gap-2 sm:gap-3 w-full">
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
                <span className="text-sm text-gray-600 hidden lg:inline">
                  {user.firstName} {user.lastName ?? ""}
                </span>
              )}
              <DemoBadge show={demo} />
              <Link
                href="/compte"
                className="text-xs sm:text-sm text-gray-500 hover:text-[#6C63FF] underline min-h-10 px-1 inline-flex items-center"
              >
                Compte et connexion
              </Link>
              <button
                type="button"
                onClick={() => { clearToken(); window.location.href = "/login"; }}
                className="text-xs sm:text-sm text-gray-500 hover:text-[#6C63FF] underline min-h-10 px-1"
              >
                Déconnexion
              </button>
            </div>
          </div>
          <nav data-mobile-nav className="senga-nav-phone senga-nav-phone-admin" aria-label="Navigation">
            {loading ? (
              <p className="col-span-3 text-xs text-gray-400 px-2 py-2">Chargement menu…</p>
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
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-10 rounded-lg text-[10px] leading-tight text-center px-0.5 ${
                      active ? "bg-[#6C63FF] text-white font-semibold" : "text-gray-600"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="line-clamp-2 break-words">{short}</span>
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
