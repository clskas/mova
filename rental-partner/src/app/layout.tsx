import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { UpdateBanner } from "@/components/UpdateBanner";
import { MaintenanceGate } from "@/components/MaintenanceGate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "SENGA Location Partenaire",
  description: "Portail partenaire — inscription véhicules location SENGA RDC",
  applicationName: "SENGA Location",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SENGA Location",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#5b54e6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={plusJakarta.variable}>
      <body className={`${plusJakarta.className} min-h-screen antialiased overflow-x-hidden font-sans`}>
        <PwaRegister />
        <UpdateBanner />
        <MaintenanceGate appId="location">{children}</MaintenanceGate>
      </body>
    </html>
  );
}
