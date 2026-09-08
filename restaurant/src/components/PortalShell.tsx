"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOGIN_AFTER_LOGOUT_HREF, logoutPartnerSession } from "@/lib/auth";
import { disableGoogleAutoSelect } from "@/components/GoogleContinueButton";
import { PUBLIC_API_BASE } from "@/lib/public-api-base";
import { useRestaurantLiveConnected } from "@/components/RestaurantLiveProvider";

const NAV = [
  { href: "/dashboard", label: "Tableau de bord", short: "Accueil", icon: "📊" },
  { href: "/", label: "Commandes", short: "Commandes", icon: "🧾" },
  { href: "/menu", label: "Menu", short: "Menu", icon: "🍽️" },
  { href: "/dossier", label: "Mon dossier", short: "Dossier", icon: "📁" },
  { href: "/promos", label: "Codes promo", short: "Promos", icon: "🏷️" },
  { href: "/earnings", label: "Revenus", short: "Revenus", icon: "💰" },
  { href: "/compte", label: "Compte et connexion", short: "Compte", icon: "👤" },
  { href: "/settings", label: "Paramètres", short: "Réglages", icon: "⚙️" },
  { href: "/aide", label: "Aide / Manuel", short: "Manuel", icon: "❓" },
  { href: "/manuel", label: "Manuel utilisateur", short: "Manuel", icon: "📘" },
];

function navActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function PortalShell({ children, restaurantName }: { children: React.ReactNode; restaurantName?: string }) {
  const pathname = usePathname();
  const liveConnected = useRestaurantLiveConnected();

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
          <div data-brand>
            <p className="text-[10px] sm:text-xs text-orange-600 font-medium uppercase tracking-wide">SENGA Partenaire</p>
            <h1 className="font-semibold text-base sm:text-lg text-[#1A1A2E] truncate">{restaurantName ?? "Restaurant"}</h1>
            {liveConnected && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                En direct
              </span>
            )}
          </div>
          <nav data-desktop-nav className="senga-nav-desktop items-center gap-1 flex-wrap justify-center min-w-0">
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
        </div>
      </header>

      <main className="senga-portal-main flex-1 p-3 sm:p-4 lg:p-6 max-w-5xl mx-auto w-full min-w-0">
        {children}
      </main>

      <nav data-mobile-nav className="senga-nav-phone" aria-label="Navigation">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-10 rounded-xl text-[11px] leading-tight text-center px-1 ${
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
        <button
          type="button"
          onClick={logout}
          aria-label="Déconnexion"
          className="flex flex-col items-center justify-center gap-0.5 min-h-10 rounded-xl text-[11px] leading-tight text-center px-1 text-gray-600"
        >
          <span className="text-base leading-none" aria-hidden>
            🚪
          </span>
          Déconnexion
        </button>
      </nav>
    </div>
  );
}
