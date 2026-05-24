import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

const root = process.cwd();

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // Static game content lives outside public/ for historical reasons.
    // Copy each folder into dist/ at build time so fetch('data/foo.json'),
    // <img src="images/...">, and audio paths keep resolving in production.
    viteStaticCopy({
      targets: [
        { src: "data", dest: "." },
        { src: "images", dest: "." },
        { src: "audio", dest: "." },
        { src: "assets", dest: "." }
      ]
    }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "CJS Engine",
        short_name: "CJS",
        description: "Cosmic Jester System — tactical RPG combat, campaign, and content engine.",
        start_url: "./index.html",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#0a1024",
        theme_color: "#1a2540",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        // This is a multi-page app, not an SPA. Disable the SPA navigation
        // fallback so an unmatched URL doesn't silently get served
        // index.html — that was making iframe requests like
        // combat.html?embed=launcher render the launcher inside the iframe
        // (stacked sidebars bug).
        navigateFallback: null,
        // Match precache entries regardless of these query strings so
        // ?embed=launcher and ?t=cachebust still hit cached HTML.
        ignoreURLParametersMatching: [/^embed$/, /^t$/, /^v$/],
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|webp|gif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "cjs-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /\.(?:mp3|ogg|wav|m4a)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "cjs-audio",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /\.(?:mp4|webm)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "cjs-video",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /\.json$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "cjs-data" }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        tests: resolve(root, "tests.html"),
        combat: resolve(root, "combat.html"),
        campaign: resolve(root, "campaign.html"),
        editor: resolve(root, "editor.html"),
        minigames: resolve(root, "minigames.html")
      }
    }
  }
});
