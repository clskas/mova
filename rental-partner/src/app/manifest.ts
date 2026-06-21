import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MOVA Location Partenaire",
    short_name: "MOVA Location",
    description: "Inscrivez vos véhicules sur la plateforme MOVA RDC",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f3ff",
    theme_color: "#6366f1",
    lang: "fr",
    categories: ["business", "travel"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
