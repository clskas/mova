"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

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
    clearToken();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-orange-100 px-3 sm:px-4 py-2 flex items-center justify-between gap-3">
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
          className="md:hidden inline-flex items-center justify-center min-h-10 min-w-10 rounded-xl border border-orange-100 text-[#1A1A2E]"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="text-xl leading-none">{menuOpen ? "✕" : "☰"}</span>
        </button>
      </header>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fermer" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-x-0 top-0 max-h-[100dvh] bg-white shadow-xl flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
            <div className="px-3 py-2 border-b border-orange-50 flex items-center justify-between">
              <p className="font-semibold text-[#1A1A2E]">Menu</p>
              <button type="button" className="min-h-10 min-w-10 rounded-lg text-gray-500" onClick={() => setMenuOpen(false)}>
                ✕
              </button>
            </div>
            <nav className="grid grid-cols-2 gap-1.5 p-2 overflow-hidden">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm min-h-10 ${
                    navActive(pathname, item.href) ? "bg-orange-100 text-orange-800 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
              ))}
              <button
                type="button"
                onClick={logout}
                className="col-span-2 min-h-10 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Déconnexion
              </button>
            </nav>
          </aside>
        </div>
      )}

      <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-5xl mx-auto w-full min-w-0 pb-[calc(6.75rem+env(safe-area-inset-bottom))] md:pb-6">
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-orange-100 grid grid-cols-3 gap-x-0.5 gap-y-0 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-10 text-[10px] leading-tight text-center px-0.5 ${
              navActive(pathname, item.href) ? "text-orange-700 font-semibold" : "text-gray-500"
            }`}
          >
            <span className="text-sm leading-none" aria-hidden>
              {item.icon}
            </span>
            {item.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
