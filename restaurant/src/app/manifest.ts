import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MOVA Restaurant",
    short_name: "MOVA Resto",
    description: "Portail partenaire restaurant — commandes, menu et revenus MOVA RDC",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8f3",
    theme_color: "#FF6B35",
    lang: "fr",
    categories: ["food", "business"],
    shortcuts: [
      { name: "Commandes", url: "/", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Revenus", url: "/earnings", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Menu", url: "/menu", icons: [{ src: "/icon.svg", sizes: "any" }] },
    ],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
