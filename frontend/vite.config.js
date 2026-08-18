import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The PWA is served as fully static files (npm run build) behind Nginx, which
// reverse-proxies /api and /_ to PocketBase on the same origin. During local
// dev we proxy those paths to the PocketBase dev server on :8090.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Keep the service worker OUT of dev — a stale cached SW would intercept
      // /api requests and return 404s that never reach the dev server. The SW
      // is only generated for production builds.
      devOptions: {
        enabled: false,
      },
      // Only cache the static app shell. Check-ins MUST hit the network so the
      // server can validate the geofence in real time — never serve a cached
      // "success" for an attendance POST.
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/_/],
        runtimeCaching: [],
        // Keep the PDF machinery out of the precache. reportPdf is imported
        // dynamically and only an admin exporting ever needs it; jsPDF drags
        // in html2canvas and dompurify behind its own dynamic imports. Left in
        // the manifest the service worker downloads ~800kB of it onto every
        // employee's phone at install, which defeats the dynamic import
        // entirely. These are still served normally over the network.
        globIgnores: [
          "**/reportPdf-*.js",
          "**/index.es-*.js",
          "**/html2canvas.esm-*.js",
          "**/purify.es-*.js",
        ],
      },
      manifest: {
        name: "Office Attendance",
        short_name: "Attendance",
        description: "Check in and out from the office.",
        theme_color: "#1d4ed8",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8090",
      "/_": "http://127.0.0.1:8090",
    },
  },
});
