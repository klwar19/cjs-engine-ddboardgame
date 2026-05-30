// test_visual_regression.js — Phase K.2 visual-regression harness guard.
//
// Three layers, mirroring test_virtual_list.js / test_selector_store.js:
//   1. Real logic test for the pure HTML normalizer (run.cjs::normalizeHtml) —
//      a wrong indent/void-element rule would make every snapshot diff noisy,
//      so we exercise the actual function.
//   2. Render every case in-process (no spawn) via the harness, assert NONE
//      throw, and that each rendered tree matches its committed snapshot in
//      tools/visual-regression/__snapshots__/. A mismatch is the regression
//      signal; re-baseline intentional UI changes with `npm run vr:update`.
//   3. Coverage contract — every tab in CampaignShell's REACT_TAB_COMPONENTS
//      map has a `tab-<id>` case, and the 5 chrome strips are covered. This is
//      the "future dev nicely" guard: add a tab, and CI makes you snapshot it.
//
// Run: node test_visual_regression.js

const fs = require("node:fs");
const path = require("node:path");

const {
  renderAll,
  normalizeHtml,
  snapshotPath,
  SNAP_DIR
} = require("./tools/visual-regression/run.cjs");

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

console.log("Campaign visual-regression tests (Phase K.2)");

// ── Layer 1: the pure HTML normalizer ───────────────────────────────────────
ok("normalizeHtml is a function", typeof normalizeHtml === "function");
ok(
  "normalizeHtml splits adjacent tags onto their own lines",
  normalizeHtml("<div><span>x</span></div>").split("\n").filter(Boolean).length === 3
);
ok(
  "normalizeHtml indents by nesting depth",
  normalizeHtml("<div><span>x</span></div>").includes("\n  <span>")
);
ok(
  "normalizeHtml keeps a void element from opening a depth level",
  // <input/> must NOT indent the sibling after it.
  normalizeHtml("<form><input value=\"a\"/><button>b</button></form>") ===
    '<form>\n  <input value="a"/>\n  <button>b</button>\n</form>\n'
);
ok(
  "normalizeHtml is idempotent on already-flat input",
  normalizeHtml("<p>hi</p>") === "<p>hi</p>\n"
);

// ── Layer 2: render every case + snapshot match ──────────────────────────────
ok("__snapshots__ directory exists", fs.existsSync(SNAP_DIR));

const results = renderAll();
ok("harness produced cases", results.length > 0, results.length + " cases");

const threw = results.filter((r) => r.error);
ok(
  "no case throws during render",
  threw.length === 0,
  threw.length ? threw.map((r) => r.name + ": " + r.error).join("; ") : undefined
);

let matched = 0;
let mismatched = 0;
let missing = 0;
for (const r of results) {
  if (r.error) continue;
  const file = snapshotPath(r.name);
  if (!fs.existsSync(file)) {
    missing += 1;
    ok("snapshot exists for " + r.name, false, "run `npm run vr:update`");
    continue;
  }
  const expected = fs.readFileSync(file, "utf8");
  if (expected === r.html) {
    matched += 1;
  } else {
    mismatched += 1;
    ok("snapshot matches for " + r.name, false, "UI changed; re-baseline with `npm run vr:update`");
  }
  // Sanity: a committed snapshot should never be empty.
  ok("snapshot for " + r.name + " is non-empty", expected.trim().length > 0);
}
ok(
  "all rendered cases match their committed snapshot",
  mismatched === 0 && missing === 0,
  matched + " matched"
);

// ── Layer 3: coverage contract ───────────────────────────────────────────────
const shellSrc = fs.readFileSync(
  path.join(__dirname, "src/campaign/CampaignShell.tsx"),
  "utf8"
);
// Pull the REACT_TAB_COMPONENTS block and read its `key: lazy(` entries.
const blockMatch = shellSrc.match(/REACT_TAB_COMPONENTS[^{]*\{([\s\S]*?)\n\};/);
ok("found REACT_TAB_COMPONENTS map in CampaignShell.tsx", !!blockMatch);
const registeredTabs = blockMatch
  ? Array.from(blockMatch[1].matchAll(/(\w+):\s*lazy\(/g)).map((m) => m[1])
  : [];
ok("parsed registered tab ids", registeredTabs.length >= 30, registeredTabs.length + " tabs");

const casesSrc = fs.readFileSync(
  path.join(__dirname, "tools/visual-regression/cases.tsx"),
  "utf8"
);
const caseNames = new Set(
  Array.from(casesSrc.matchAll(/tab\("([^"]+)"/g)).map((m) => m[1])
);

for (const id of registeredTabs) {
  ok("registered tab '" + id + "' has a VR case", caseNames.has("tab-" + id));
}

for (const strip of ["chrome-header", "chrome-modebar", "chrome-subtabs", "chrome-recentlog", "chrome-commandrail"]) {
  ok("chrome strip '" + strip + "' has a VR case", caseNames.has(strip));
}

// Every rendered case must correspond to a committed snapshot file, and vice
// versa — no orphan snapshots left behind after a case is removed.
const snapFiles = new Set(
  fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, ""))
);
const renderedNames = new Set(results.map((r) => r.name));
const orphans = [...snapFiles].filter((n) => !renderedNames.has(n));
ok("no orphan snapshot files", orphans.length === 0, orphans.length ? orphans.join(", ") : undefined);

console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
