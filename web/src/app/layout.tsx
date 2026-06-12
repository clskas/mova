import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOVA — Mobilité RDC",
  description: "Réservez un taxi ou moto-taxi partout en RDC en CDF (Kinshasa par défaut)",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "MOVA" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#1A1A2E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
