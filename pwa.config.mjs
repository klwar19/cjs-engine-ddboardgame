// pwa.config.mjs — PWA manifest + Workbox service-worker policy.
//
// Extracted from vite.config.mjs so the caching policy is a single, testable
// data structure (test_pwa_config.js imports this module directly and asserts
// the shape). vite.config.mjs imports `pwaManifest` + `workboxOptions` and
// hands them straight to VitePWA.
//
// Phase I.5 — runtime-cache policy keyed by mode. Previously the PWA precached
// EVERY emitted chunk (`globPatterns: **/*.{js,...}`), so a first visit to any
// page downloaded the whole app — combat grid renderer, editor, minigames, all
// of it — in the background. With the domain-split chunks (vite.config.mjs
// `manualChunks`), we now precache only the app SHELL (HTML/CSS/SVG/manifest)
// plus the universal React runtime, and fetch every domain chunk ON DEMAND in
// a per-mode cache bucket. A Story-Mode-only player therefore never downloads
// `cjs-combat` / `cjs-grid` until (unless) they actually open combat.
//
// Hashed chunk filenames are immutable (`[name]-[hash].js`), so CacheFirst is
// correct for the runtime code buckets: a new build emits a new name → cache
// miss → fresh fetch; superseded names age out via the expiration caps.

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export const pwaManifest = {
  name: "CJS Engine",
  short_name: "CJS",
  description:
    "Cosmic Jester System — tactical RPG combat, campaign, and content engine.",
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
};

// Code chunks fetched + cached on demand, grouped by play mode. Keyed on the
// STABLE `manualChunks` name prefixes from vite.config.mjs (volatile React.lazy
// component chunks fall through to the shared bucket — still on demand, just
// not separately bucketed). Order matters: the specific mode buckets are
// registered before the shared `.js` catch-all so they match first. The
// catch-all also pattern-matches the precached universal chunks, but the
// precache route is registered first and wins, so they never reach it.
const codeRuntimeCaching = [
  {
    // Combat: entry + engine + grid renderer + combat AI. The headline win —
    // a campaign/story player's SW never requests these.
    urlPattern: /\/assets\/(?:combat|cjs-combat|cjs-grid|cjs-ai)-[A-Za-z0-9_-]+\.js$/,
    handler: "CacheFirst",
    options: {
      cacheName: "cjs-code-combat",
      expiration: { maxEntries: 24, maxAgeSeconds: THIRTY_DAYS }
    }
  },
  {
    // Minigames + QTE: only fetched when a minigame / quick-time event runs.
    urlPattern: /\/assets\/(?:minigames|cjs-minigames|cjs-qte)-[A-Za-z0-9_-]+\.js$/,
    handler: "CacheFirst",
    options: {
      cacheName: "cjs-code-minigames",
      expiration: { maxEntries: 16, maxAgeSeconds: THIRTY_DAYS }
    }
  },
  {
    // Campaign: entry + the cjs-campaign-* families + the lazy CampaignXxxTab
    // chunks. The bulk of the campaign weight, fetched only on the campaign
    // page.
    urlPattern: /\/assets\/(?:campaign|Campaign[A-Za-z]*|cjs-campaign[A-Za-z-]*)-[A-Za-z0-9_-]+\.js$/,
    handler: "CacheFirst",
    options: {
      cacheName: "cjs-code-campaign",
      expiration: { maxEntries: 80, maxAgeSeconds: THIRTY_DAYS }
    }
  },
  {
    // Everything else not precached: cjs-core, cjs-media, effects/services,
    // editor + *Editor builders, scene-player, portrait-picker, and the shared
    // lazy panels. One on-demand bucket.
    urlPattern: /\/assets\/[A-Za-z0-9_-]+\.js$/,
    handler: "CacheFirst",
    options: {
      cacheName: "cjs-code-shared",
      expiration: { maxEntries: 100, maxAgeSeconds: THIRTY_DAYS }
    }
  }
];

export const workboxOptions = {
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  // This is a multi-page app, not an SPA. Disable the SPA navigation
  // fallback so an unmatched URL doesn't silently get served index.html —
  // that was making iframe requests like combat.html?embed=launcher render
  // the launcher inside the iframe (stacked sidebars bug).
  navigateFallback: null,
  // Match precache entries regardless of these query strings so
  // ?embed=launcher and ?t=cachebust still hit cached HTML (and css?v=...).
  ignoreURLParametersMatching: [/^embed$/, /^t$/, /^v$/],
  // PRECACHE = the app shell only. HTML/CSS/SVG/manifest (small, shared by
  // every page) + the universal React runtime every page boots with
  // (react-vendor) and the tiny loader shims Vite emits. Domain JS is deliberately
  // NOT here — it is runtime-cached per mode below.
  globPatterns: [
    "**/*.{css,html,svg,webmanifest}",
    "assets/react-vendor-*.js",
    "assets/rolldown-runtime-*.js",
    "assets/preload-helper-*.js"
  ],
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  runtimeCaching: [
    ...codeRuntimeCaching,
    {
      urlPattern: /\.(?:png|jpg|jpeg|webp|gif)$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "cjs-images",
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 200, maxAgeSeconds: THIRTY_DAYS }
      }
    },
    {
      urlPattern: /\.(?:mp3|ogg|wav|m4a)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "cjs-audio",
        expiration: { maxEntries: 80, maxAgeSeconds: THIRTY_DAYS }
      }
    },
    {
      urlPattern: /\.(?:mp4|webm)$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "cjs-video",
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 30, maxAgeSeconds: THIRTY_DAYS }
      }
    },
    {
      urlPattern: /\.json$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "cjs-data",
        networkTimeoutSeconds: 6
      }
    }
  ]
};
