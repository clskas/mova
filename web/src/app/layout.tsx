import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { UpdateBanner } from "@/components/UpdateBanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "SENGA — Mobilité RDC",
  description: "Réservez un taxi ou moto-taxi partout en RDC en CDF (Kinshasa par défaut)",
  appleWebApp: { capable: true, title: "SENGA", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1A2E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Plain manifest link: Next metadata adds crossorigin=use-credentials, which breaks iOS Add to Home Screen. */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-[100dvh] antialiased overflow-x-hidden">
        <PwaRegister />
        <UpdateBanner />
        {children}
        <PwaInstallBanner />
      </body>
    </html>
  );
}
