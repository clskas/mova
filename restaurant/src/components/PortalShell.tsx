"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { useRestaurantLiveConnected } from "@/components/RestaurantLiveProvider";

export function PortalShell({ children, restaurantName }: { children: React.ReactNode; restaurantName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const liveConnected = useRestaurantLiveConnected();

  function logout() {
    clearToken();
    router.replace("/login");
  }

  const nav = [
    { href: "/", label: "Commandes" },
    { href: "/menu", label: "Menu" },
    { href: "/promos", label: "Codes promo" },
    { href: "/earnings", label: "Revenus" },
    { href: "/settings", label: "Paramètres" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-orange-100 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">MOVA Partenaire</p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-semibold text-lg text-[#1A1A2E]">{restaurantName ?? "Restaurant"}</h1>
            {liveConnected && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                En direct
              </span>
            )}
          </div>
        </div>
        <nav className="flex items-center gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                pathname === item.href ? "bg-orange-100 text-orange-800 font-medium" : "text-gray-600 hover:bg-gray-100"
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
