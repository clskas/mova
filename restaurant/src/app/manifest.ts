import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SENGA Partenaire",
    short_name: "SENGA Partenaire",
    description: "Portail partenaire SENGA — commandes, catalogue et revenus (RDC)",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8f3",
    theme_color: "#FF6B35",
    lang: "fr",
    dir: "ltr",
    categories: ["business", "shopping"],
    shortcuts: [
      { name: "Commandes", short_name: "Commandes", url: "/", icons: [{ src: "/icon-192.png?v=partner-v18", sizes: "192x192" }] },
      { name: "Revenus", short_name: "Revenus", url: "/earnings", icons: [{ src: "/icon-192.png?v=partner-v18", sizes: "192x192" }] },
      { name: "Menu", short_name: "Menu", url: "/menu", icons: [{ src: "/icon-192.png?v=partner-v18", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icon-192.png?v=partner-v18", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png?v=partner-v18", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png?v=partner-v18", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg?v=partner-v18", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
