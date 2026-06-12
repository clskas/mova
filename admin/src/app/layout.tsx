import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOVA Admin",
  description: "Console d'administration MOVA — couverture nationale RDC",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
