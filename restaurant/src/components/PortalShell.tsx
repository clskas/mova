"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { useRestaurantLiveConnected } from "@/components/RestaurantLiveProvider";

const NAV = [
  { href: "/dashboard", label: "Tableau de bord", short: "Accueil", icon: "📊" },
  { href: "/", label: "Commandes", short: "Commandes", icon: "🧾" },
  { href: "/menu", label: "Menu", short: "Menu", icon: "🍽️" },
  { href: "/promos", label: "Codes promo", short: "Promos", icon: "🏷️" },
  { href: "/earnings", label: "Revenus", short: "Revenus", icon: "💰" },
  { href: "/settings", label: "Paramètres", short: "Réglages", icon: "⚙️" },
];

function navActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function PortalShell({ children, restaurantName }: { children: React.ReactNode; restaurantName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const liveConnected = useRestaurantLiveConnected();

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-orange-100 pt-[env(safe-area-inset-top)]">
        <div className="px-3 sm:px-4 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-orange-600 font-medium uppercase tracking-wide">SENGA Partenaire</p>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-semibold text-base sm:text-lg text-[#1A1A2E] truncate">{restaurantName ?? "Restaurant"}</h1>
              {liveConnected && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                  En direct
                </span>
              )}
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1 flex-wrap justify-end">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm min-h-11 inline-flex items-center ${
                  navActive(pathname, item.href)
                    ? "bg-orange-100 text-orange-800 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button type="button" onClick={logout} className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 min-h-11">
              Déconnexion
            </button>
          </nav>
          <button
            type="button"
            onClick={logout}
            className="md:hidden shrink-0 px-2.5 min-h-10 rounded-lg text-xs text-gray-600 border border-orange-100"
          >
            Déconnexion
          </button>
        </div>
        <nav className="md:hidden grid grid-cols-3 gap-1 px-2 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-11 rounded-xl text-[11px] leading-tight text-center px-1 ${
                navActive(pathname, item.href)
                  ? "bg-orange-100 text-orange-800 font-semibold"
                  : "text-gray-600"
              }`}
            >
              <span className="text-base leading-none" aria-hidden>
                {item.icon}
              </span>
              {item.short}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-5xl mx-auto w-full min-w-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
