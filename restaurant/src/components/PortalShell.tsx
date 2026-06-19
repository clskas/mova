"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";

export function PortalShell({ children, restaurantName }: { children: React.ReactNode; restaurantName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearToken();
    router.replace("/login");
  }

  const nav = [
    { href: "/", label: "Commandes" },
    { href: "/settings", label: "Paramètres" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-orange-100 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">MOVA Partenaire</p>
          <h1 className="font-semibold text-lg text-[#1A1A2E]">{restaurantName ?? "Restaurant"}</h1>
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
