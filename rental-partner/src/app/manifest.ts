import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MOVA Location Partenaire",
    short_name: "MOVA Location",
    description: "Portail partenaire location — véhicules, réservations et revenus MOVA RDC",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f3ff",
    theme_color: "#6366f1",
    lang: "fr",
    categories: ["business", "travel"],
    shortcuts: [
      { name: "Réservations", url: "/reservations", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Revenus", url: "/revenus", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Véhicules", url: "/vehicules", icons: [{ src: "/icon.svg", sizes: "any" }] },
    ],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
