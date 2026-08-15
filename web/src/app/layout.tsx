import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UpdateBanner } from "@/components/UpdateBanner";

export const metadata: Metadata = {
  title: "SENGA — Mobilité RDC",
  description: "Réservez un taxi ou moto-taxi partout en RDC en CDF (Kinshasa par défaut)",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "SENGA" },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1A2E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased overflow-x-hidden">
        <UpdateBanner />
        {children}
      </body>
    </html>
  );
}
