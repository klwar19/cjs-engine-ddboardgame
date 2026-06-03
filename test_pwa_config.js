// test_pwa_config.js — Phase I.5 service-worker runtime-cache policy.
//
// The Workbox policy lives in pwa.config.mjs as a plain data structure, so we
// can import the REAL config and test its behavior — not a regex over source.
// The two things that must hold:
//   1. Precache is the app SHELL only (HTML/CSS/SVG/manifest + the universal
//      React runtime). It must NOT precache every JS chunk (the old behavior
//      that downloaded combat/editor/minigames on a first campaign visit).
//   2. Each domain chunk routes to an on-demand, per-mode runtime cache. We
//      run the actual urlPattern RegExps against real emitted chunk names and
//      assert combat chunks land in the combat bucket, campaign in campaign,
//      etc. — and that the universal runtime is precached (the glob), so the
//      "Story-Mode player never downloads the combat grid renderer" property
//      holds end to end.
//
// Run: node test_pwa_config.js

let pass = 0;
let fail = 0;
function ok(label, cond, info) {
  if (cond) {
    pass += 1;
    console.log('  OK  ' + label + (info ? ' (' + info + ')' : ''));
  } else {
    fail += 1;
    console.log('  XX  ' + label + (info ? ' (' + info + ')' : ''));
  }
}

// Minimal glob → RegExp for the patterns pwa.config uses (`**/`, `*`,
// `{a,b,c}`). Self-checked below before we trust it.
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` → any (or zero) leading path segments
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*'; // single `*` → within a path segment
      }
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(?:' + glob.slice(i + 1, end).split(',').join('|') + ')';
      i = end;
    } else if ('.+^$()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}
function precaches(globs, file) {
  return globs.some((g) => globToRe(g).test(file));
}
function routeFor(rules, url) {
  for (const r of rules) {
    if (r.urlPattern instanceof RegExp && r.urlPattern.test(url)) {
      return r.options && r.options.cacheName;
    }
  }
  return null;
}

(async () => {
  console.log('PWA service-worker config tests (Phase I.5)');

  // Self-check the glob matcher before relying on it.
  ok('glob matcher: **/*.css matches nested css',
     globToRe('**/*.{css,html}').test('assets/x.css') && globToRe('**/*.{css,html}').test('a.html'));
  ok('glob matcher: assets/react-vendor-*.js is segment-scoped',
     globToRe('assets/react-vendor-*.js').test('assets/react-vendor-DBDHBr2m.js') &&
     !globToRe('assets/react-vendor-*.js').test('assets/cjs-combat-x.js'));

  let mod;
  try {
    mod = await import('./pwa.config.mjs');
  } catch (e) {
    ok('pwa.config.mjs imports', false, String(e));
    console.log('\nRESULTS: ' + pass + ' passed, ' + (fail || 1) + ' failed');
    process.exit(1);
    return;
  }
  const { pwaManifest, workboxOptions } = mod;
  ok('pwa.config exports pwaManifest + workboxOptions', !!pwaManifest && !!workboxOptions);
  ok('service worker activates updates immediately',
     workboxOptions.skipWaiting === true && workboxOptions.clientsClaim === true);
  ok('service worker cleans outdated precache entries',
     workboxOptions.cleanupOutdatedCaches === true);

  // ── Manifest ──────────────────────────────────────────────────────────
  ok('manifest names the app', pwaManifest.name === 'CJS Engine');
  ok('manifest start_url + scope are relative (GH Pages subpath safe)',
     pwaManifest.start_url === './index.html' && pwaManifest.scope === './');
  ok('manifest ships the icon', Array.isArray(pwaManifest.icons) && pwaManifest.icons.length > 0);

  // ── Precache = shell only ────────────────────────────────────────────────
  const globs = workboxOptions.globPatterns;
  ok('globPatterns is an array', Array.isArray(globs));
  const precachesAllJs = globs.some(
    (g) => /\*\*\/\*\.js$/.test(g) || /\{[^}]*\bjs\b[^}]*\}/.test(g)
  );
  ok('precache does NOT grab every JS chunk (the old waste)', precachesAllJs === false);
  ok('precache keeps the static shell (css/html/svg/webmanifest)',
     globs.some((g) => /\{[^}]*css[^}]*html[^}]*\}/.test(g) || (/css/.test(g) && /html/.test(g))));

  // Real emitted chunk names (from the baseline build).
  const SHELL_JS = 'assets/react-vendor-DBDHBr2m.js';
  const COMBAT_JS = 'assets/cjs-combat-BeQwwkJj.js';
  const GRID_JS = 'assets/cjs-grid-DWjYEjop.js';
  const CAMPAIGN_CORE_JS = 'assets/cjs-campaign-core-BJCTTl-7.js';
  const CAMPAIGN_ENTRY_JS = 'assets/campaign-HioIrBle.js';
  const CAMPAIGN_TAB_JS = 'assets/CampaignLogsTab-A1b2C3d4.js';
  const MINIGAMES_JS = 'assets/cjs-minigames-FDdlmPKm.js';
  const QTE_JS = 'assets/cjs-qte-DVDcfODz.js';
  const CORE_JS = 'assets/cjs-core-DPBJnge1.js';
  const MEDIA_JS = 'assets/cjs-media-Cs6FIZIU.js';
  const PERSISTENCE_JS = 'assets/cjs-persistence-A1b2C3d4.js';
  const EDITOR_JS = 'assets/MonsterEditor-B9V5wZdJ.js';

  ok('precache INCLUDES the universal React runtime (react-vendor)', precaches(globs, SHELL_JS));
  ok('precache EXCLUDES the combat engine chunk', !precaches(globs, COMBAT_JS));
  ok('precache EXCLUDES the combat grid renderer', !precaches(globs, GRID_JS));
  ok('precache EXCLUDES the campaign core chunk', !precaches(globs, CAMPAIGN_CORE_JS));
  ok('precache EXCLUDES the persistence adapter chunk', !precaches(globs, PERSISTENCE_JS));
  ok('precache EXCLUDES the minigames chunk', !precaches(globs, MINIGAMES_JS));
  ok('precache EXCLUDES the editor builder chunks', !precaches(globs, EDITOR_JS));

  // ── Runtime caching: per-mode buckets, real routing ──────────────────────
  const rc = workboxOptions.runtimeCaching;
  ok('runtimeCaching is an array', Array.isArray(rc));
  const buckets = new Set(rc.map((r) => r.options && r.options.cacheName));
  for (const name of ['cjs-code-combat', 'cjs-code-minigames', 'cjs-code-campaign', 'cjs-code-shared']) {
    ok(`runtime bucket "${name}" exists`, buckets.has(name));
  }
  // Hashed chunks are immutable → CacheFirst is correct for the code buckets.
  const codeRules = rc.filter((r) => String(r.options && r.options.cacheName).startsWith('cjs-code-'));
  ok('code buckets use CacheFirst (immutable hashed names)',
     codeRules.length >= 4 && codeRules.every((r) => r.handler === 'CacheFirst'));
  ok('code buckets cap stale versions via expiration',
     codeRules.every((r) => r.options && r.options.expiration && r.options.expiration.maxEntries > 0));

  // The headline routing: combat chunks → combat bucket; never the campaign one.
  // Precache globs match dist-relative paths ("assets/x.js"); runtime
  // urlPatterns match request URLs, where the path is "/.../assets/x.js" — so
  // route checks use the leading-slash request form.
  const req = (f) => '/' + f;
  ok('combat engine → cjs-code-combat', routeFor(rc, req(COMBAT_JS)) === 'cjs-code-combat');
  ok('combat grid renderer → cjs-code-combat', routeFor(rc, req(GRID_JS)) === 'cjs-code-combat');
  ok('combat entry → cjs-code-combat', routeFor(rc, req('assets/combat-B0fiAp8N.js')) === 'cjs-code-combat');
  ok('minigames → cjs-code-minigames', routeFor(rc, req(MINIGAMES_JS)) === 'cjs-code-minigames');
  ok('qte → cjs-code-minigames', routeFor(rc, req(QTE_JS)) === 'cjs-code-minigames');
  ok('campaign core → cjs-code-campaign', routeFor(rc, req(CAMPAIGN_CORE_JS)) === 'cjs-code-campaign');
  ok('campaign entry → cjs-code-campaign', routeFor(rc, req(CAMPAIGN_ENTRY_JS)) === 'cjs-code-campaign');
  ok('lazy CampaignXxxTab → cjs-code-campaign', routeFor(rc, req(CAMPAIGN_TAB_JS)) === 'cjs-code-campaign');
  ok('shared engine core → cjs-code-shared', routeFor(rc, req(CORE_JS)) === 'cjs-code-shared');
  ok('media chunk → cjs-code-shared', routeFor(rc, req(MEDIA_JS)) === 'cjs-code-shared');
  ok('persistence adapter → cjs-code-shared', routeFor(rc, req(PERSISTENCE_JS)) === 'cjs-code-shared');
  ok('editor builder → cjs-code-shared', routeFor(rc, req(EDITOR_JS)) === 'cjs-code-shared');
  // Combat bucket must NOT swallow non-combat chunks.
  ok('combat bucket does not match campaign chunks',
     !rc[0].urlPattern.test(req(CAMPAIGN_CORE_JS)) && rc[0].options.cacheName === 'cjs-code-combat');
  ok('combat bucket does not match the universal runtime',
     !rc[0].urlPattern.test(req(SHELL_JS)));

  // ── Media rules preserved ────────────────────────────────────────────────
  ok('image runtime cache preserved', !!rc.find((r) => r.options && r.options.cacheName === 'cjs-images'));
  ok('audio runtime cache preserved', !!rc.find((r) => r.options && r.options.cacheName === 'cjs-audio'));
  ok('data (json) runtime cache preserved', !!rc.find((r) => r.options && r.options.cacheName === 'cjs-data'));
  ok('mutable image cache is network-first to avoid stale art',
     rc.find((r) => r.options && r.options.cacheName === 'cjs-images')?.handler === 'NetworkFirst');
  ok('mutable video cache is network-first to avoid missing/stale banners',
     rc.find((r) => r.options && r.options.cacheName === 'cjs-video')?.handler === 'NetworkFirst');
  ok('manifest/data json is network-first to avoid stale world metadata',
     rc.find((r) => r.options && r.options.cacheName === 'cjs-data')?.handler === 'NetworkFirst');
  ok('multi-page navigateFallback stays disabled', workboxOptions.navigateFallback === null);
  ok('embed/cachebust query params still ignored for precache matching',
     Array.isArray(workboxOptions.ignoreURLParametersMatching) &&
     workboxOptions.ignoreURLParametersMatching.length === 3);
  ok('iframe cb query is NOT ignored so mode HTML bypasses stale precache',
     !workboxOptions.ignoreURLParametersMatching.some((re) => re.test('cb')));

  console.log('');
  console.log('RESULTS: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
})();
