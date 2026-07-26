import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SENGA Restaurant",
    short_name: "SENGA Resto",
    description: "Portail partenaire restaurant — commandes, menu et revenus SENGA RDC",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8f3",
    theme_color: "#FF6B35",
    lang: "fr",
    dir: "ltr",
    categories: ["food", "business"],
    shortcuts: [
      { name: "Commandes", short_name: "Commandes", url: "/", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Revenus", short_name: "Revenus", url: "/earnings", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Menu", short_name: "Menu", url: "/menu", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
