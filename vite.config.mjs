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
    // The campaign-core chunk holds the React campaign tree (shell/boot,
    // tabs, data builders, action handlers). campaign-ui.js is fully
    // retired (Phase H.4) — the chunk is ~270 KB now. The 700 KB warning
    // limit stays as headroom; Phase I re-baselines per-chunk sizes.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        tests: resolve(root, "tests.html"),
        combat: resolve(root, "combat.html"),
        campaign: resolve(root, "campaign.html"),
        editor: resolve(root, "editor.html"),
        minigames: resolve(root, "minigames.html")
      },
      output: {
        // Split vendor + per-domain code so a single bug-fix doesn't
        // invalidate the entire campaign bundle for end users. The
        // manualChunks here are loaded eagerly (static imports), but
        // they cache separately. Async lazy-loading for the campaign
        // tab families happens via React.lazy in the React shell.
        manualChunks: (id) => {
          if (id.includes("node_modules/react")) return "react-vendor";
          if (id.includes("/js/minigames/")) return "cjs-minigames";
          if (id.includes("/js/qte/")) return "cjs-qte";
          if (id.includes("/js/ui/l2d") || id.includes("/js/ui/audio")) return "cjs-media";
          if (id.includes("/js/campaign/campaign-scenario-generator")) return "cjs-campaign-generators";
          if (id.includes("/js/campaign/campaign-story-")) return "cjs-campaign-story";
          if (id.includes("/js/campaign/campaign-sequence-")) return "cjs-campaign-sequences";
          if (id.includes("/js/campaign/campaign-world-map") || id.includes("/js/campaign/campaign-map.js")) return "cjs-campaign-maps";
          if (id.includes("/js/campaign/farming-mode") || id.includes("/js/campaign/pocket-haven")) return "cjs-campaign-haven";
          if (id.includes("/js/campaign/scenario-runner")) return "cjs-campaign-scenario-runner";
          if (id.includes("/js/campaign/")) return "cjs-campaign-core";
          if (id.includes("/js/combat/")) return "cjs-combat";
          if (id.includes("/js/grid/")) return "cjs-grid";
          if (id.includes("/js/ai/")) return "cjs-ai";
          if (id.includes("/js/effects/")) return "cjs-effects";
          if (id.includes("/js/core/")) return "cjs-core";
          if (id.includes("/js/services/")) return "cjs-services";
          return undefined;
        }
      }
    }
  }
});
