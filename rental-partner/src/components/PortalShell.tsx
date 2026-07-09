"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { usePartnerLiveConnected } from "@/components/PartnerLiveProvider";

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

  const nav = [
    { href: "/", label: "Tableau de bord" },
    { href: "/vehicules", label: "Véhicules" },
    { href: "/reservations", label: "Réservations" },
    { href: "/revenus", label: "Revenus" },
    { href: "/promos", label: "Codes promo" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-indigo-100 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">MOVA Partenaire</p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-semibold text-lg text-[#1A1A2E]">{partnerName ?? "Location véhicules"}</h1>
            {liveConnected && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                En direct
              </span>
            )}
          </div>
        </div>
        <nav className="flex items-center gap-2 flex-wrap">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "bg-indigo-100 text-indigo-800 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button type="button" onClick={logout} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
            Déconnexion
          </button>
        </nav>
      </header>
      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">{children}</main>
    </div>
  );
}
