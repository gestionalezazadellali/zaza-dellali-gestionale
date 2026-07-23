import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestionale Zaza Dell’Ali",
    short_name: "Zaza Dell’Ali",
    description: "Gestionale dello Studio Legale Zaza Dell’Ali",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#17213a",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
