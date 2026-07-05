import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "MOVA Admin",
  description: "Console d'administration MOVA — couverture nationale RDC",
  applicationName: "MOVA Admin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MOVA Admin",
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#6C63FF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={plusJakarta.variable}>
      <body className={`${plusJakarta.className} min-h-screen antialiased font-sans bg-[var(--background)] text-[var(--foreground)]`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
