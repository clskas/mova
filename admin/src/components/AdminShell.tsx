"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  AccountIcon,
  ContactsIcon,
  CguIcon,
} from "@/components/AdminIcons";
import { DemoBadge } from "@/components/ui";
import { checkGatewayHealth } from "@/lib/api";
import { clearToken, getToken, managedCityFromToken } from "@/lib/auth";
import { navForRole, ROLE_LABELS, roleBadgeClass, canWriteSection, type NavItem } from "@/lib/rbac";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/": MetricsIcon,
  "/utilisateurs": UsersIcon,
  "/chauffeurs": DriversIcon,
  "/kyc": KycIcon,
  "/contacts": ContactsIcon,
  "/cgu": CguIcon,
  "/operateurs-mm": WalletIcon,
  "/services-senga": SettingsIcon,
  "/abonnements-externes": SubscriptionIcon,
  "/alertes-sos": IncidentsIcon,
  "/maintenance": SettingsIcon,
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
  "/compte": AccountIcon,
};

/** Preferred shortcuts for the phone bottom bar (first matches in role nav). */
const MOBILE_PRIMARY_HREFS = ["/", "/courses", "/chauffeurs", "/kyc", "/livraisons", "/restaurants"];

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [demo, setDemo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { role, loading, user, accessLevelIds } = useAdmin();
  const managedCity = user?.managedCity?.trim() || managedCityFromToken() || null;

  useEffect(() => {
    checkGatewayHealth().then((ok) => setDemo(!ok && !getToken()));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const nav: NavItem[] = role ? navForRole(role, accessLevelIds) : [];
  const hasWriteAccess = role
    ? nav.some((item) => canWriteSection(role, item.section, accessLevelIds))
    : false;

  const primaryNav = useMemo(() => {
    const picked: NavItem[] = [];
    for (const href of MOBILE_PRIMARY_HREFS) {
      const item = nav.find((n) => n.href === href);
      if (item) picked.push(item);
      if (picked.length >= 4) break;
    }
    return picked;
  }, [nav]);

  const primaryHrefs = useMemo(() => new Set(primaryNav.map((n) => n.href)), [primaryNav]);
  const moreNav = useMemo(() => nav.filter((n) => !primaryHrefs.has(n.href)), [nav, primaryHrefs]);
  const menuActive = menuOpen || moreNav.some((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));

  function logout() {
    clearToken();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen flex overflow-x-hidden">
      <aside
        data-desktop-nav
        className="senga-nav-desktop w-64 h-screen sticky top-0 text-white flex flex-col overflow-hidden shrink-0"
        style={{ background: "var(--sidebar-gradient)" }}
      >
        <div className="p-5 border-b border-white/10 shrink-0">
          <div className="flex flex-col items-center text-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={40} height={40} className="rounded-xl shadow-lg shadow-violet-900/40" />
            <div className="min-w-0 w-full">
              <p className="font-semibold tracking-tight text-[15px]">SENGA Admin</p>
              <p className="text-[11px] opacity-55 mt-0.5">Couverture nationale RDC</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 min-h-0 p-3 overflow-y-auto">
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
                      active
                        ? "bg-[#5b54e6] text-white font-medium shadow-md shadow-violet-950/30"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 opacity-90" />
                    <span>{label}</span>
                  </Link>
                );
              })}
              <Link
                href="/compte"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm min-h-11 transition-colors ${
                  pathname.startsWith("/compte")
                    ? "bg-[#5b54e6] text-white font-medium"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <AccountIcon className="w-4 h-4 shrink-0" />
                <span>Compte et connexion</span>
              </Link>
            </div>
          )}
        </nav>
        <div className="p-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={logout}
            className="w-full text-left text-sm text-white/60 hover:text-white px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors"
          >
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[var(--mova-border)] pt-[var(--safe-top)]">
          {role === "CITY_ADMIN" && managedCity && (
            <div className="px-3 lg:px-6 py-1.5 bg-teal-50/90 border-b border-teal-100/80 text-xs sm:text-sm text-teal-900 text-center lg:text-left font-medium">
              Périmètre : {managedCity}
            </div>
          )}
          <div className="px-3 lg:px-6 py-2.5 lg:py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[#0f1222] truncate leading-tight">SENGA Admin</p>
                {user?.firstName && (
                  <p className="text-[11px] text-[var(--mova-muted)] truncate">
                    {user.firstName} {user.lastName ?? ""}
                  </p>
                )}
              </div>
            </div>
            <div className="hidden lg:block text-sm text-[var(--mova-muted)]">
              {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}` : "Console SENGA"}
            </div>
            <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0">
              {role && (
                <span className={`text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-semibold tracking-wide ${roleBadgeClass(role)}`}>
                  {ROLE_LABELS[role]}
                </span>
              )}
              {role && !loading && (
                <span
                  className={`text-[11px] px-2.5 py-1 rounded-full hidden sm:inline font-medium ${
                    hasWriteAccess ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {hasWriteAccess ? "Édition" : "Lecture"}
                </span>
              )}
              <DemoBadge show={demo} />
              <Link
                href="/compte"
                className="hidden sm:inline-flex items-center min-h-10 px-3 rounded-xl bg-[#5b54e6] text-white text-xs sm:text-sm font-semibold hover:bg-[#4f49d4] shadow-sm shadow-violet-500/25"
              >
                Compte
              </Link>
              <button
                type="button"
                onClick={logout}
                className="text-xs sm:text-sm text-[var(--mova-muted)] hover:text-[#5b54e6] font-medium min-h-10 px-1.5"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-auto pb-[calc(var(--phone-nav-h)+var(--safe-bottom)+0.75rem)] lg:pb-8">
          <div className="mova-page">{children}</div>
        </main>

        {/* Phone bottom navigation */}
        <nav
          data-mobile-bottom-nav
          className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--mova-border)] bg-white/95 backdrop-blur-lg pb-[var(--safe-bottom)] shadow-[0_-8px_30px_rgba(15,18,34,0.06)]"
          aria-label="Navigation principale"
        >
          <div className="grid grid-cols-5 gap-0.5 px-1 pt-1.5 pb-1 max-w-lg mx-auto">
            {loading ? (
              <p className="col-span-5 text-center text-xs text-slate-400 py-3">…</p>
            ) : (
              <>
                {primaryNav.map(({ href, label, short }) => {
                  const Icon = ICONS[href] ?? MetricsIcon;
                  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-label={label}
                      className={`flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] rounded-xl text-[10px] font-medium leading-tight px-0.5 transition-colors ${
                        active ? "text-[#5b54e6] bg-violet-50" : "text-slate-500"
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="truncate max-w-full">{short}</span>
                    </Link>
                  );
                })}
                <button
                  type="button"
                  aria-label="Plus de menus"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(true)}
                  className={`flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] rounded-xl text-[10px] font-medium leading-tight px-0.5 transition-colors ${
                    menuActive ? "text-[#5b54e6] bg-violet-50" : "text-slate-500"
                  }`}
                >
                  <MenuIcon className="w-5 h-5" />
                  <span>Menu</span>
                </button>
              </>
            )}
          </div>
        </nav>

        {/* Full menu sheet (phone) */}
        {menuOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu SENGA">
            <button
              type="button"
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              aria-label="Fermer"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl bg-white shadow-2xl flex flex-col pb-[var(--safe-bottom)] senga-sheet-enter">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-[#0f1222]">Tous les menus</p>
                  <p className="text-xs text-slate-500 mt-0.5">Navigation complète</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="min-h-10 min-w-10 rounded-full bg-slate-100 text-slate-600 text-lg leading-none"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {nav.map(({ href, label, short }) => {
                  const Icon = ICONS[href] ?? MetricsIcon;
                  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2.5 rounded-2xl px-3 py-3 min-h-14 border transition-colors ${
                        active
                          ? "bg-violet-50 border-violet-200 text-[#5b54e6]"
                          : "bg-slate-50/80 border-transparent text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${active ? "bg-violet-100" : "bg-white shadow-sm"}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-medium leading-snug">{label || short}</span>
                    </Link>
                  );
                })}
                <Link
                  href="/compte"
                  className={`flex items-center gap-2.5 rounded-2xl px-3 py-3 min-h-14 border col-span-2 sm:col-span-1 ${
                    pathname.startsWith("/compte")
                      ? "bg-violet-50 border-violet-200 text-[#5b54e6]"
                      : "bg-slate-50/80 border-transparent text-slate-700"
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm shrink-0">
                    <AccountIcon className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-medium">Compte</span>
                </Link>
              </div>
            </div>
          </div>
        )}
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
