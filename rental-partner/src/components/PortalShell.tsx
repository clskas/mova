"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { usePartnerLiveConnected } from "@/components/PartnerLiveProvider";

const NAV = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: "📊" },
  { href: "/vehicules", label: "Véhicules", short: "Véhicules", icon: "🚗" },
  { href: "/reservations", label: "Réservations", short: "Reservation", icon: "📅" },
  { href: "/revenus", label: "Revenus", short: "Revenus", icon: "💰" },
  { href: "/promos", label: "Codes promo", short: "Promos", icon: "🏷️" },
];

function navActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

export function PortalShell({
  children,
  partnerName,
}: {
  children: React.ReactNode;
  partnerName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const liveConnected = usePartnerLiveConnected();

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-30 overflow-x-hidden bg-white/95 backdrop-blur border-b border-indigo-100 pt-[env(safe-area-inset-top)]">
        <div className="px-3 sm:px-4 py-2 flex flex-col items-center gap-2">
          <div data-brand>
            <p className="text-[10px] sm:text-xs text-indigo-600 font-medium uppercase tracking-wide">SENGA Partenaire</p>
            <h1 className="font-semibold text-base sm:text-lg text-[#1A1A2E] truncate">{partnerName ?? "Location véhicules"}</h1>
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
                    ? "bg-indigo-100 text-indigo-800 font-medium"
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
        <nav data-mobile-nav className="senga-nav-phone" aria-label="Navigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-10 rounded-xl text-[11px] leading-tight text-center px-1 ${
                navActive(pathname, item.href)
                  ? "bg-indigo-100 text-indigo-800 font-semibold"
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
            Deconnection
          </button>
        </nav>
      </header>

      <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-5xl mx-auto w-full min-w-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
