// test_http_smoke.js — post-build HTTP artifact smoke (Tier 0).
//
// The DOM-backed live smoke (test_campaign_shell_live.js) mounts the real
// React shell in happy-dom, but it cannot verify that the BUILT artifacts are
// actually servable: that every chunk/stylesheet/icon the emitted HTML
// references resolves over HTTP (no 404s, correct base-path resolution under
// vite's `base: "./"`), and that the PWA manifest + service worker + icons are
// reachable. A broken build reference (a stale chunk name, a missing precache
// asset, a bad relative path) passes typecheck/tests/size:check but 404s in a
// browser. This serves dist/ over a real HTTP server and asserts 200 for the
// full reference graph of each page + the PWA surface.
//
// This is a POST-BUILD test: it needs dist/ (run `npm run build` first; CI runs
// it as a dedicated step after the build). If dist/ is absent it skips cleanly
// so it never fails a pre-build invocation.
//
// No Chromium / Playwright dep (matches test_launcher_live.js / the VR harness):
// it verifies servability + reference integrity, not pixel layout — the real
// running-browser paint/canvas pass is still tracked as open in the plan.

const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "dist");

let pass = 0;
let fail = 0;
function ok(label, cond, info) {
  if (cond) {
    pass += 1;
    console.log("  OK  " + label + (info ? " (" + info + ")" : ""));
  } else {
    fail += 1;
    console.log("  XX  " + label + (info ? " (" + info + ")" : ""));
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

// Minimal static server for dist/, mirroring a plain static host (the GitHub
// Pages deploy target). Resolves within dist/ only (no traversal).
function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    let rel = urlPath.replace(/^\/+/, "");
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    const filePath = path.join(DIST, rel);
    // Containment guard: never serve outside dist/.
    if (!filePath.startsWith(DIST + path.sep) && filePath !== DIST) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Resolve a page-relative reference (vite emits `./assets/x` under base "./")
// against the page's directory, producing a server-absolute path.
function resolveRef(pageRel, ref) {
  if (/^https?:\/\//i.test(ref) || ref.startsWith("//") || ref.startsWith("data:")) return null; // external/inline
  const pageDir = path.posix.dirname("/" + pageRel.split(path.sep).join("/"));
  return path.posix.normalize(path.posix.join(pageDir, ref.replace(/[?#].*$/, "")));
}

// Pull every same-origin asset URL a built HTML page references (entry script,
// modulepreloads, stylesheets, icons, manifest, SW registration).
function referencedAssets(html) {
  const refs = new Set();
  const attrRe = /(?:href|src)\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = attrRe.exec(html))) refs.add(m[1]);
  return [...refs];
}

const HTML_PAGES = ["index.html", "campaign.html", "combat.html", "editor.html", "minigames.html", "tests.html"];

(async () => {
  if (!fs.existsSync(DIST)) {
    console.log("  --  dist/ not present; skipping HTTP smoke (run `npm run build` first)");
    console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
    process.exit(0);
  }

  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const get = (p) => fetch(base + (p.startsWith("/") ? p : "/" + p));

  try {
    // ── 1. Every HTML entry serves 200 + text/html, and every asset it
    //       references resolves 200 (reference-graph integrity). ────────────
    for (const page of HTML_PAGES) {
      const res = await get("/" + page);
      ok(`page ${page} serves 200`, res.status === 200, `status ${res.status}`);
      ok(`page ${page} is text/html`, (res.headers.get("content-type") || "").includes("text/html"));
      if (res.status !== 200) continue;
      const html = await res.text();
      const refs = referencedAssets(html)
        .map((r) => resolveRef(page, r))
        .filter((r) => r && r.startsWith("/") && !r.startsWith("//"));
      let missing = [];
      for (const ref of refs) {
        const r = await get(ref);
        if (r.status !== 200) missing.push(`${ref}=${r.status}`);
      }
      ok(`page ${page}: all ${refs.length} referenced assets resolve 200`, missing.length === 0,
        missing.length ? missing.slice(0, 4).join(", ") : `${refs.length} refs`);
    }

    // ── 2. PWA manifest reachable, valid JSON, and every icon it lists 200s. ─
    const manRes = await get("/manifest.webmanifest");
    ok("manifest.webmanifest serves 200", manRes.status === 200, `status ${manRes.status}`);
    ok("manifest content-type is JSON/manifest",
      /json|manifest/.test(manRes.headers.get("content-type") || ""));
    let manifest = null;
    if (manRes.status === 200) {
      try { manifest = JSON.parse(await manRes.text()); } catch { /* invalid */ }
      ok("manifest parses as JSON", !!manifest);
    }
    if (manifest) {
      const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
      ok("manifest lists at least one icon", icons.length > 0, `${icons.length} icons`);
      let badIcons = [];
      for (const icon of icons) {
        if (!icon || !icon.src) { badIcons.push("(no src)"); continue; }
        const r = await get("/" + icon.src.replace(/^\.?\//, ""));
        if (r.status !== 200 || !(r.headers.get("content-type") || "").startsWith("image/")) {
          badIcons.push(`${icon.src}=${r.status}`);
        }
      }
      ok("every manifest icon resolves 200 as an image", badIcons.length === 0,
        badIcons.length ? badIcons.join(", ") : `${icons.length} icons`);
      // start_url must be servable (the PWA install entry point).
      if (manifest.start_url) {
        const r = await get("/" + String(manifest.start_url).replace(/^\.?\//, ""));
        ok("manifest start_url resolves 200", r.status === 200, `${manifest.start_url}=${r.status}`);
      }
    }

    // ── 3. Service worker + Workbox runtime + registration script reachable. ─
    const sw = await get("/sw.js");
    ok("sw.js serves 200", sw.status === 200, `status ${sw.status}`);
    ok("sw.js is JavaScript", (sw.headers.get("content-type") || "").includes("javascript"));
    if (sw.status === 200) {
      const swText = await sw.text();
      // The Workbox runtime the SW loads must itself be servable. The generated
      // SW references it without the extension (`"./workbox-<hash>"`, with `.js`
      // appended at runtime), so match the stem and append `.js` when fetching.
      const wbMatch = swText.match(/workbox-[A-Za-z0-9_-]+/);
      ok("sw.js references a Workbox runtime chunk", !!wbMatch);
      if (wbMatch) {
        const wbFile = wbMatch[0].endsWith(".js") ? wbMatch[0] : wbMatch[0] + ".js";
        const r = await get("/" + wbFile);
        ok("Workbox runtime chunk resolves 200", r.status === 200, `${wbFile}=${r.status}`);
      }
    }
    const reg = await get("/registerSW.js");
    ok("registerSW.js serves 200", reg.status === 200, `status ${reg.status}`);

    // ── 4. Top-level PWA icons (precached by includeAssets) are servable. ────
    for (const icon of ["icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      const r = await get("/" + icon);
      ok(`${icon} serves 200 as an image`,
        r.status === 200 && (r.headers.get("content-type") || "").startsWith("image/"),
        `status ${r.status}`);
    }
  } catch (error) {
    console.error(error);
    fail += 1;
  } finally {
    server.close();
  }

  console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
