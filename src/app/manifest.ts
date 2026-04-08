import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ResumeForge",
    short_name: "ResumeForge",
    description: "AI-powered resume builder",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f0eb",
    theme_color: "#b04520",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
