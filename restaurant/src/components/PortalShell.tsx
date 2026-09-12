"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
      className="absolute -top-1 -right-1 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold leading-[1.15rem] text-center tabular-nums"
      aria-label={`${count} commande${count > 1 ? "s" : ""} en attente`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function PortalShell({
  children,
  restaurantName,
  commerceType = "RESTAURANT",
}: {
  children: React.ReactNode;
  restaurantName?: string;
  commerceType?: CommerceType;
}) {
  const pathname = usePathname();
  const liveConnected = useRestaurantLiveConnected();
  const [pendingCount, setPendingCount] = useState(0);
  const nav = useMemo(() => navItemsForCommerceType(commerceType), [commerceType]);
  const typeLabel = COMMERCE_TYPE_LABELS_FR[commerceType] ?? COMMERCE_TYPE_LABELS_FR.RESTAURANT;

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

  function logout() {
    disableGoogleAutoSelect();
    void logoutPartnerSession(PUBLIC_API_BASE).finally(() => {
      window.location.replace(LOGIN_AFTER_LOGOUT_HREF);
    });
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-orange-100 pt-[env(safe-area-inset-top)]">
        <div className="px-3 sm:px-4 py-2 flex flex-col items-center gap-2">
          <div data-brand className="flex flex-col items-center gap-1">
            <p className="text-[10px] sm:text-xs text-orange-600 font-medium uppercase tracking-wide">SENGA Business</p>
            <h1 className="font-semibold text-base sm:text-lg text-[#1A1A2E] truncate">{restaurantName ?? "Partenaire"}</h1>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                {typeLabel}
              </span>
              {liveConnected && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
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
                  aria-label={
                    showBadge > 0 ? `${item.label} (${showBadge} en attente)` : item.label
                  }
                  className={`relative flex flex-col items-center justify-center gap-0.5 min-h-10 rounded-xl text-[11px] leading-tight text-center px-2 sm:px-3 sm:min-h-11 sm:text-sm sm:flex-row sm:gap-1.5 ${
                    active
                      ? "bg-orange-100 text-orange-800 font-semibold"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className="text-base leading-none sm:hidden" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="sm:hidden">{item.short}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                  <PendingBadge count={showBadge} />
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              aria-label="Déconnexion"
              className="flex flex-col items-center justify-center gap-0.5 min-h-10 rounded-xl text-[11px] leading-tight text-center px-2 text-gray-600 hover:bg-gray-100 sm:px-3 sm:min-h-11 sm:text-sm sm:flex-row sm:gap-1.5"
            >
              <span className="text-base leading-none sm:hidden" aria-hidden>
                🚪
              </span>
              <span className="sm:hidden">Déconnexion</span>
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="senga-portal-main flex-1 p-3 sm:p-4 lg:p-6 max-w-5xl mx-auto w-full min-w-0">
        {children}
      </main>
    </div>
  );
}
