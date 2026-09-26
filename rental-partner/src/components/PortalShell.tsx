"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { LOGIN_AFTER_LOGOUT_HREF, logoutPartnerSession } from "@/lib/auth";
import { disableGoogleAutoSelect } from "@/components/GoogleContinueButton";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import { usePartnerLiveConnected, usePartnerLiveRegister } from "@/components/PartnerLiveProvider";
import { fetchDashboard } from "@/lib/api";

const NAV = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: "📊", badgeKey: null as null | "pending" },
  { href: "/dossier", label: "Mon dossier", short: "Dossier", icon: "📁", badgeKey: null },
  { href: "/vehicules", label: "Véhicules", short: "Véhicules", icon: "🚗", badgeKey: null },
  { href: "/reservations", label: "Réservations", short: "Réserv.", icon: "📅", badgeKey: "pending" as const },
  { href: "/revenus", label: "Revenus", short: "Revenus", icon: "💰", badgeKey: null },
  { href: "/promos", label: "Codes promo", short: "Promos", icon: "🏷️", badgeKey: null },
  { href: "/parametres", label: "Paramètres", short: "Réglages", icon: "⚙️", badgeKey: null },
  { href: "/compte", label: "Compte et connexion", short: "Compte", icon: "👤", badgeKey: null },
  { href: "/aide", label: "Aide / Manuel", short: "Aide", icon: "❓", badgeKey: null },
];

const PRIMARY_ORDER = ["/", "/reservations", "/vehicules", "/revenus"];

function navActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -top-0.5 -right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-[var(--brand)] text-white text-[10px] font-bold leading-[1.15rem] text-center tabular-nums shadow-sm"
      aria-label={`${count} réservation${count > 1 ? "s" : ""} en attente`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function MenuGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PortalShell({
  children,
  partnerName,
}: {
  children: React.ReactNode;
  partnerName?: string;
}) {
  const pathname = usePathname();
  const liveConnected = usePartnerLiveConnected();
  const [pendingCount, setPendingCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryNav = useMemo(() => {
    const picked: typeof NAV = [];
    for (const href of PRIMARY_ORDER) {
      const item = NAV.find((n) => n.href === href);
      if (item) picked.push(item);
      if (picked.length >= 4) break;
    }
    return picked;
  }, []);

  const refreshPending = useCallback(async () => {
    try {
      const dash = await fetchDashboard();
      setPendingCount(dash.kpis?.pendingBookings ?? 0);
    } catch {
      /* keep last known count */
    }
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  usePartnerLiveRegister(refreshPending);

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

  function logout() {
    disableGoogleAutoSelect();
    void logoutPartnerSession(PUBLIC_API_BASE).finally(() => {
      window.location.replace(LOGIN_AFTER_LOGOUT_HREF);
    });
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[var(--mova-border)] pt-[var(--safe-top)]">
        <div className="px-3 sm:px-4 py-2.5 flex flex-col items-center gap-2">
          <div data-brand>
            <p className="text-[10px] sm:text-xs text-[var(--brand)] font-semibold uppercase tracking-[0.14em]">
              SENGA Partenaire
            </p>
            <h1 className="font-semibold text-base sm:text-lg text-[#0f1222] truncate tracking-tight">
              {partnerName ?? "Location véhicules"}
            </h1>
            {liveConnected && (
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-100">
                En direct
              </span>
            )}
          </div>
          <nav data-portal-nav className="senga-portal-nav" aria-label="Navigation">
            {NAV.map((item) => {
              const active = navActive(pathname, item.href);
              const showBadge = item.badgeKey === "pending" ? pendingCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={showBadge > 0 ? `${item.label} (${showBadge} en attente)` : item.label}
                  className={`relative flex items-center justify-center gap-1.5 min-h-11 rounded-xl text-sm px-3 transition-colors ${
                    active
                      ? "bg-[var(--brand-soft)] text-[var(--brand)] font-semibold ring-1 ring-[var(--brand-ring)]/50"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{item.label}</span>
                  <PendingBadge count={showBadge} />
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              aria-label="Déconnexion"
              className="flex items-center justify-center min-h-11 rounded-xl text-sm px-3 text-slate-600 hover:bg-slate-50 font-medium"
            >
              Déconnexion
            </button>
          </nav>
        </div>
      </header>

      <main className="senga-portal-main flex-1 p-3 sm:p-4 lg:p-6 max-w-5xl mx-auto w-full min-w-0">{children}</main>

      <nav
        data-portal-bottom-nav
        className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--mova-border)] bg-white/95 backdrop-blur-lg pb-[var(--safe-bottom)] shadow-[0_-8px_28px_rgba(15,18,34,0.06)]"
        aria-label="Navigation principale"
      >
        <div className="grid grid-cols-5 gap-0.5 px-1 pt-1.5 pb-1 max-w-lg mx-auto">
          {primaryNav.map((item) => {
            const active = navActive(pathname, item.href);
            const showBadge = item.badgeKey === "pending" ? pendingCount : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[3.35rem] rounded-xl text-[10px] font-medium leading-tight px-0.5 ${
                  active ? "text-[var(--brand)] bg-[var(--brand-soft)]" : "text-slate-500"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="truncate max-w-full">{item.short}</span>
                <PendingBadge count={showBadge} />
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Plus de menus"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[3.35rem] rounded-xl text-[10px] font-medium ${
              menuOpen ? "text-[var(--brand)] bg-[var(--brand-soft)]" : "text-slate-500"
            }`}
          >
            <MenuGlyph className="w-5 h-5" />
            <span>Plus</span>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu partenaire">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fermer" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl bg-white shadow-2xl flex flex-col pb-[var(--safe-bottom)] senga-sheet-enter">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-[#0f1222]">Menu partenaire</p>
                <p className="text-xs text-slate-500 mt-0.5">Location véhicules</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="min-h-10 min-w-10 rounded-full bg-slate-100 text-slate-600 text-lg"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto p-3 grid grid-cols-2 gap-2">
              {NAV.map((item) => {
                const active = navActive(pathname, item.href);
                const showBadge = item.badgeKey === "pending" ? pendingCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-2.5 rounded-2xl px-3 py-3 min-h-14 border ${
                      active
                        ? "bg-[var(--brand-soft)] border-[var(--brand-ring)] text-[var(--brand)]"
                        : "bg-slate-50 border-transparent text-slate-700"
                    }`}
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="text-sm font-medium leading-snug">{item.label}</span>
                    <PendingBadge count={showBadge} />
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={logout}
                className="col-span-2 flex items-center justify-center gap-2 rounded-2xl px-3 py-3 min-h-12 bg-slate-900 text-white text-sm font-semibold"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
