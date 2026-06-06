import { resolve, relative, sep } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { pwaManifest, workboxOptions } from "./pwa.config.mjs";

const root = process.cwd();
const cssTarget = (major, minor = 0, patch = 0) => (major << 16) | (minor << 8) | patch;
const cssTargets = {
  chrome: cssTarget(91),
  edge: cssTarget(91),
  firefox: cssTarget(90),
  safari: cssTarget(14, 1),
  ios_saf: cssTarget(14, 5)
};

// Dev-only: when a data/*.json content file changes on disk (a hand edit, an
// import, or the authoring CLI), push a custom HMR event so the browser
// re-ingests just that file into DataStore in place — no page reload (Phase
// J.5). The browser side lives in src/dev/data-hot-reload-client.ts.
function cjsDataHotReload() {
  const DATA_RE = /^data\/.+\.json$/;
  const toRel = (file) => relative(root, file).split(sep).join("/");
  return {
    name: "cjs-data-hot-reload",
    apply: "serve",
    configureServer(server) {
      // data/*.json files aren't in the module graph — make sure they're watched.
      server.watcher.add(resolve(root, "data"));
      const notify = (file) => {
        const rel = toRel(file);
        if (!DATA_RE.test(rel)) return;
        server.ws.send({ type: "custom", event: "cjs:data-change", data: { path: rel } });
        server.config.logger.info(`[cjs] data change → ${rel}`, { timestamp: true });
      };
      server.watcher.on("change", notify);
      server.watcher.on("add", notify);
    },
    handleHotUpdate(ctx) {
      // We handle data JSON ourselves (custom event + in-place reload); don't
      // let Vite trigger a full-page reload for a non-module file.
      if (DATA_RE.test(toRel(ctx.file))) return [];
      return undefined;
    }
  };
}

export default defineConfig({
  base: "./",
  css: {
    transformer: "lightningcss",
    lightningcss: {
      targets: cssTargets
    }
  },
  plugins: [
    react(),
    cjsDataHotReload(),
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
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png"],
      // Manifest + Workbox policy live in pwa.config.mjs (a single, testable
      // data structure — see test_pwa_config.js). Phase I.5 shifted precache
      // from "every chunk" to "app shell + universal runtime", with the domain
      // chunks runtime-cached per mode.
      manifest: pwaManifest,
      workbox: workboxOptions
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
        //
        // Persistence gets its own shared chunk so the Vite preload helper
        // stays a tiny app-shell loader instead of absorbing idb + migrations
        // and being precached for every mode.
        manualChunks: (id) => {
          // Tier 3 (engine JS→TS) moves js/<area>/<mod>.js to
          // src/engine/<area>/<mod>.ts one module at a time. Normalize a TS
          // port's path back onto its js/ area so a SINGLE set of area rules
          // keeps the ported module in the same chunk as the legacy file — the
          // port never shuffles a chunk boundary and never needs a rule here.
          const normalizedId = id.split("\\").join("/").replace("/src/engine/", "/js/");
          if (normalizedId.includes("node_modules/react")) return "react-vendor";
          if (normalizedId.includes("/src/persistence/") || normalizedId.includes("/node_modules/idb/")) return "cjs-persistence";
          if (normalizedId.includes("/js/minigames/")) return "cjs-minigames";
          if (normalizedId.includes("/js/qte/")) return "cjs-qte";
          if (normalizedId.includes("/js/ui/l2d") || normalizedId.includes("/js/ui/audio")) return "cjs-media";
          if (normalizedId.includes("/js/campaign/campaign-scenario-generator")) return "cjs-campaign-generators";
          if (normalizedId.includes("/js/campaign/campaign-story-")) return "cjs-campaign-story";
          if (normalizedId.includes("/js/campaign/campaign-sequence-")) return "cjs-campaign-sequences";
          // `campaign-map.` (with the dot) matches campaign-map.js / .ts but not
          // campaign-map-seed-forge (which stays in cjs-campaign-core).
          if (normalizedId.includes("/js/campaign/campaign-world-map") || normalizedId.includes("/js/campaign/campaign-map.")) return "cjs-campaign-maps";
          if (normalizedId.includes("/js/campaign/farming-mode") || normalizedId.includes("/js/campaign/pocket-haven")) return "cjs-campaign-haven";
          if (normalizedId.includes("/js/campaign/scenario-runner")) return "cjs-campaign-scenario-runner";
          if (normalizedId.includes("/js/campaign/")) return "cjs-campaign-core";
          if (normalizedId.includes("/js/combat/")) return "cjs-combat";
          if (normalizedId.includes("/js/grid/")) return "cjs-grid";
          if (normalizedId.includes("/js/ai/")) return "cjs-ai";
          if (normalizedId.includes("/js/effects/")) return "cjs-effects";
          if (normalizedId.includes("/js/core/")) return "cjs-core";
          if (normalizedId.includes("/js/services/")) return "cjs-services";
          return undefined;
        }
      }
    }
  }
});
