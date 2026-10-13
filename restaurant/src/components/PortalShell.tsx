"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LOGIN_AFTER_LOGOUT_HREF, logoutPartnerSession } from "@/lib/auth";
import { disableGoogleAutoSelect } from "@/components/GoogleContinueButton";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import { useRestaurantLiveConnected, useRestaurantLiveRegister } from "@/components/RestaurantLiveProvider";
import { fetchDashboard } from "@/lib/api";
import {
  COMMERCE_TYPE_LABELS_FR,
  type CommerceType,
  navItemsForCommerceType,
} from "@/lib/commerce-type";

function navActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -top-0.5 -right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-[var(--brand)] text-white text-[10px] font-bold leading-[1.15rem] text-center tabular-nums shadow-sm"
      aria-label={`${count} commande${count > 1 ? "s" : ""} en attente`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className ?? "w-5 h-5"} viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  );
}

function NavIcon({ href, className }: { href: string; className?: string }) {
  const stroke = { stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (href) {
    case "/dashboard":
      return (
        <Icon className={className}>
          <path d="M4 11.5 12 4l8 7.5" {...stroke} />
          <path d="M6.5 10.5V20h11V10.5" {...stroke} />
        </Icon>
      );
    case "/":
      return (
        <Icon className={className}>
          <path d="M7 4h10v16H7z" {...stroke} />
          <path d="M9 8h6M9 12h6M9 16h3" {...stroke} />
        </Icon>
      );
    case "/menu":
    case "/catalogue":
      return (
        <Icon className={className}>
          <path d="M5 6h14M5 12h14M5 18h9" {...stroke} />
        </Icon>
      );
    case "/stock":
      return (
        <Icon className={className}>
          <path d="M4 8h16v12H4z" {...stroke} />
          <path d="M8 8V6a4 4 0 0 1 8 0v2" {...stroke} />
        </Icon>
      );
    case "/restrictions":
      return (
        <Icon className={className}>
          <path d="M12 3 4.5 6.5v5.2c0 4.4 3.1 7.6 7.5 9.3 4.4-1.7 7.5-4.9 7.5-9.3V6.5L12 3z" {...stroke} />
        </Icon>
      );
    case "/earnings":
      return (
        <Icon className={className}>
          <path d="M12 3v18" {...stroke} />
          <path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 3 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" {...stroke} />
        </Icon>
      );
    case "/dossier":
      return (
        <Icon className={className}>
          <path d="M4 7.5h6l1.5 1.8H20V19H4V7.5z" {...stroke} />
        </Icon>
      );
    case "/promos":
      return (
        <Icon className={className}>
          <path d="M4 10.5 10.5 4H18v7.5L11.5 18 4 10.5z" {...stroke} />
          <circle cx="14.2" cy="7.8" r="1.1" fill="currentColor" />
        </Icon>
      );
    case "/compte":
      return (
        <Icon className={className}>
          <circle cx="12" cy="8" r="3.2" {...stroke} />
          <path d="M5.5 19c1.6-3 4-4.5 6.5-4.5S17 16 18.5 19" {...stroke} />
        </Icon>
      );
    case "/settings":
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="3" {...stroke} />
          <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" {...stroke} />
        </Icon>
      );
    case "/aide":
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="8.5" {...stroke} />
          <path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 2" {...stroke} />
          <circle cx="12" cy="16.4" r="0.9" fill="currentColor" />
        </Icon>
      );
    default:
      return (
        <Icon className={className}>
          <circle cx="12" cy="12" r="7.5" {...stroke} />
        </Icon>
      );
  }
}

function MenuGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const PRIMARY_ORDER = ["/dashboard", "/", "/menu", "/catalogue", "/earnings"];

export function PortalShell({
  children,
  restaurantName,
  ownerPhone,
  ownerEmail,
  commerceType = "RESTAURANT",
}: {
  children: React.ReactNode;
  restaurantName?: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  commerceType?: CommerceType;
}) {
  const pathname = usePathname();
  const liveConnected = useRestaurantLiveConnected();
  const [pendingCount, setPendingCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = useMemo(() => navItemsForCommerceType(commerceType), [commerceType]);
  const typeLabel = COMMERCE_TYPE_LABELS_FR[commerceType] ?? COMMERCE_TYPE_LABELS_FR.RESTAURANT;

  const primaryNav = useMemo(() => {
    const picked: typeof nav = [];
    for (const href of PRIMARY_ORDER) {
      const item = nav.find((n) => n.href === href);
      if (item) picked.push(item);
      if (picked.length >= 4) break;
    }
    return picked;
  }, [nav]);

  const refreshPending = useCallback(async () => {
    try {
      const dash = await fetchDashboard();
      setPendingCount(dash.kpis?.pendingOrders ?? 0);
    } catch {
      /* keep last known count */
    }
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useRestaurantLiveRegister(refreshPending);

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
      <header className="sticky top-0 z-30 bg-white/92 backdrop-blur-md border-b border-[var(--mova-border)] pt-[var(--safe-top)]">
        <div className="px-3 sm:px-5 py-3 flex flex-col items-center gap-2.5">
          <div data-brand className="flex flex-col items-center gap-1">
            <p className="text-[10px] sm:text-[11px] text-[var(--brand)] font-semibold uppercase tracking-[0.18em]">
              SENGA Partenaire
            </p>
            <h1 className="font-semibold text-lg sm:text-xl text-[#0f1222] truncate tracking-tight max-w-[min(100%,28rem)] px-2">
              {restaurantName ?? "Partenaire"}
            </h1>
            {(ownerPhone || ownerEmail) && (
              <p className="text-xs text-slate-500 text-center max-w-full truncate px-2">
                {[ownerPhone, ownerEmail].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
              <span className="text-[10px] uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] font-semibold ring-1 ring-[var(--brand-ring)]/40">
                {typeLabel}
              </span>
              {liveConnected && (
                <span className="text-[10px] uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-100 inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                  En direct
                </span>
              )}
            </div>
          </div>
          <nav data-portal-nav className="senga-portal-nav" aria-label="Navigation">
            {nav.map((item) => {
              const active = navActive(pathname, item.href);
              const showBadge = item.badgeKey === "pending" ? pendingCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={showBadge > 0 ? `${item.label} (${showBadge} en attente)` : item.label}
                  className={`relative flex items-center justify-center gap-2 min-h-10 rounded-xl text-sm px-3 transition-colors ${
                    active
                      ? "bg-[var(--brand-soft)] text-[var(--brand)] font-semibold ring-1 ring-[var(--brand-ring)]/50"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <NavIcon href={item.href} className="w-4 h-4 shrink-0 opacity-90" />
                  <span>{item.label}</span>
                  <PendingBadge count={showBadge} />
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              aria-label="Déconnexion"
              className="flex items-center justify-center min-h-10 rounded-xl text-sm px-3 text-slate-600 hover:bg-slate-50 font-medium"
            >
              Déconnexion
            </button>
          </nav>
        </div>
      </header>

      <main className="senga-portal-main flex-1 p-3 sm:p-4 lg:p-6 max-w-5xl mx-auto w-full min-w-0">{children}</main>

      <nav
        data-portal-bottom-nav
        className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--mova-border)] bg-white/96 backdrop-blur-lg pb-[var(--safe-bottom)] shadow-[0_-8px_28px_rgba(15,18,34,0.06)]"
        aria-label="Navigation principale"
      >
        <div className="grid grid-cols-5 gap-0.5 px-1.5 pt-1.5 pb-1 max-w-lg mx-auto">
          {primaryNav.map((item) => {
            const active = navActive(pathname, item.href);
            const showBadge = item.badgeKey === "pending" ? pendingCount : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[3.4rem] rounded-xl text-[10px] font-medium leading-tight px-0.5 ${
                  active ? "text-[var(--brand)] bg-[var(--brand-soft)]" : "text-slate-500"
                }`}
              >
                <NavIcon href={item.href} className="w-[1.15rem] h-[1.15rem]" />
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
            className={`flex flex-col items-center justify-center gap-1 min-h-[3.4rem] rounded-xl text-[10px] font-medium ${
              menuOpen ? "text-[var(--brand)] bg-[var(--brand-soft)]" : "text-slate-500"
            }`}
          >
            <MenuGlyph className="w-[1.15rem] h-[1.15rem]" />
            <span>Plus</span>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu partenaire">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fermer" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl bg-white shadow-2xl flex flex-col pb-[var(--safe-bottom)] senga-sheet-enter">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" aria-hidden />
            <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-[#0f1222]">Navigation</p>
                <p className="text-xs text-slate-500 mt-0.5">{typeLabel} · {restaurantName ?? "Partenaire"}</p>
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
            <div className="overflow-y-auto p-3 grid grid-cols-2 gap-2">
              {nav.map((item) => {
                const active = navActive(pathname, item.href);
                const showBadge = item.badgeKey === "pending" ? pendingCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-3 rounded-2xl px-3.5 py-3.5 min-h-14 border ${
                      active
                        ? "bg-[var(--brand-soft)] border-[var(--brand-ring)] text-[var(--brand)]"
                        : "bg-slate-50 border-transparent text-slate-700"
                    }`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 ring-1 ring-black/5 shrink-0">
                      <NavIcon href={item.href} className="w-[1.125rem] h-[1.125rem]" />
                    </span>
                    <span className="text-sm font-medium leading-snug">{item.label}</span>
                    <PendingBadge count={showBadge} />
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={logout}
                className="col-span-2 flex items-center justify-center gap-2 rounded-2xl px-3 py-3.5 min-h-12 bg-[#0f1222] text-white text-sm font-semibold"
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
