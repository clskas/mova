"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearToken } from "@/lib/auth";
import { usePartnerLiveConnected } from "@/components/PartnerLiveProvider";

const NAV = [
  { href: "/", label: "Tableau de bord" },
  { href: "/vehicules", label: "Véhicules" },
  { href: "/reservations", label: "Réservations" },
  { href: "/revenus", label: "Revenus" },
  { href: "/promos", label: "Codes promo" },
];

const BOTTOM = [
  { href: "/", label: "Accueil", icon: "📊" },
  { href: "/vehicules", label: "Véhicules", icon: "🚗" },
  { href: "/reservations", label: "Résas", icon: "📅" },
  { href: "/revenus", label: "Revenus", icon: "💰" },
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
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-indigo-100 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-indigo-600 font-medium uppercase tracking-wide">SENGA Partenaire</p>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-semibold text-base sm:text-lg text-[#1A1A2E] truncate">{partnerName ?? "Location véhicules"}</h1>
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
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl border border-indigo-100 text-[#1A1A2E]"
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
          <aside className="absolute right-0 top-0 h-full w-[min(86vw,20rem)] bg-white shadow-xl flex flex-col pt-[env(safe-area-inset-top)]">
            <div className="px-4 py-4 border-b border-indigo-50 flex items-center justify-between">
              <p className="font-semibold text-[#1A1A2E]">Menu</p>
              <button type="button" className="min-h-11 min-w-11 rounded-lg text-gray-500" onClick={() => setMenuOpen(false)}>
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 rounded-xl text-base min-h-12 ${
                    navActive(pathname, item.href) ? "bg-indigo-100 text-indigo-800 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={logout} className="w-full min-h-12 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Déconnexion
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-5xl mx-auto w-full min-w-0 pb-24 md:pb-6">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-indigo-100 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {BOTTOM.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-14 text-[11px] ${
              navActive(pathname, item.href) ? "text-indigo-700 font-semibold" : "text-gray-500"
            }`}
          >
            <span className="text-base leading-none" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
