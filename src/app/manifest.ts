import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marketing CRM",
    short_name: "Marketing CRM",
    description:
      "Klinik Hijraa marketing WhatsApp inbox — AI bot, team chat & lead pipeline",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d33b8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
