import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MOVA Location Partenaire",
    short_name: "MOVA Location",
    description: "Portail partenaire location — véhicules, réservations et revenus MOVA RDC",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f3ff",
    theme_color: "#6366f1",
    lang: "fr",
    dir: "ltr",
    categories: ["business", "travel"],
    shortcuts: [
      { name: "Réservations", short_name: "Résas", url: "/reservations", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Revenus", short_name: "Revenus", url: "/revenus", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Véhicules", short_name: "Flotte", url: "/vehicules", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
