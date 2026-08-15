import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { UpdateBanner } from "@/components/UpdateBanner";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "SENGA Admin",
  description: "Console d'administration SENGA — couverture nationale RDC",
  applicationName: "SENGA Admin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SENGA Admin",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#6C63FF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={plusJakarta.variable}>
      <body className={`${plusJakarta.className} min-h-screen antialiased font-sans bg-[var(--background)] text-[var(--foreground)]`}>
        <PwaRegister />
        <UpdateBanner />
        {children}
      </body>
    </html>
  );
}
