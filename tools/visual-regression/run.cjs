// run.cjs — the visual-regression renderer + snapshot diff (Phase K.2).
//
//   node tools/visual-regression/run.cjs            # check against snapshots
//   node tools/visual-regression/run.cjs --update    # (re)write snapshots
//   node tools/visual-regression/run.cjs --list      # list case names
//
// Renders each case in tools/visual-regression/cases.tsx to static HTML with
// react-dom/server (no DOM needed) and compares the normalized markup to the
// committed snapshot in __snapshots__/<name>.html. A diff fails CI — that is
// the regression signal. `--update` regenerates after an intended UI change,
// the same contract as `npm run size:baseline`.

const fs = require("node:fs");
const path = require("node:path");

const { installEnv } = require("./env.cjs");
const { createLoader } = require("./load-tsx.cjs");

const SNAP_DIR = path.join(__dirname, "__snapshots__");
const SRC = path.resolve(__dirname, "../../src/campaign");
const JS_CAMPAIGN = path.resolve(__dirname, "../../js/campaign");

// ── HTML normalization ───────────────────────────────────────────────────────
// renderToStaticMarkup emits one long line. Put each tag on its own line and
// indent by nesting depth so diffs are readable and stable. Pure formatting —
// no semantic change. Guarded so a weird token can never crash the run (falls
// back to the flat one-tag-per-line form).
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
]);

function normalizeHtml(html) {
  const flat = String(html).replace(/></g, ">\n<");
  try {
    const lines = flat.split("\n");
    let depth = 0;
    const out = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const isClose = /^<\//.test(line);
      const isOpen = /^<[a-zA-Z]/.test(line) && !isClose;
      const tagName = (line.match(/^<\/?([a-zA-Z0-9]+)/) || [])[1] || "";
      const selfClosing = /\/>\s*$/.test(line) || VOID.has(tagName.toLowerCase());
      // A line like `<div>text</div>` opens and closes on itself — neutral.
      const opensAndCloses = isOpen && new RegExp(`</${tagName}>\\s*$`).test(line);
      if (isClose) depth = Math.max(0, depth - 1);
      out.push("  ".repeat(depth) + line);
      if (isOpen && !selfClosing && !opensAndCloses) depth += 1;
    }
    return out.join("\n") + "\n";
  } catch {
    return flat + "\n";
  }
}

// ── Load order: real util modules → JS islands → cases ───────────────────────
function loadHarness() {
  installEnv();
  const { load } = createLoader();

  // 1. Real TS leaf-util modules self-install on window.CJS.CampaignUIInternal.*
  //    (the same surface the browser sees). Load them before the JS islands,
  //    which alias those namespaces at their IIFE top.
  const utilModules = [
    "cui-utils", "cui-portraits", "cui-log", "cui-controls",
    "cui-modals", "cui-options", "cui-equipment", "cui-hub-tab",
    "cui-tabs-registry", "cui-world-map-tab", "cui-react-bridge"
  ];
  for (const m of utilModules) load(path.join(SRC, "util", `${m}.ts`));

  // 2. The surviving vanilla island (roster detail row + member math). It is
  //    an IIFE that attaches PartyTab to window.CJS.CampaignUIInternal;
  //    loading it through the same transform runs the IIFE (no imports → no
  //    require calls). The hub side-content primitives (HubTab) are now a TS
  //    util module loaded above (Phase K.3).
  for (const f of ["ui/tabs/cui-party-tab.js"]) {
    load(path.join(JS_CAMPAIGN, f));
  }

  // 3. The cases + engine stub (depends on the namespaces above being present).
  const mod = load(path.join(__dirname, "cases.tsx"));
  mod.installEngine();
  return mod.cases;
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderCase(React, renderToStaticMarkup, c) {
  const html = renderToStaticMarkup(c.element);
  return normalizeHtml(html);
}

// Render every case in-process. Returns [{ name, html, error }]. Used by both
// the CLI (below) and test_visual_regression.js (which asserts no errors +
// coverage without re-spawning a process).
function renderAll() {
  const cases = loadHarness();
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return cases.map((c) => {
    try {
      return { name: c.name, html: renderCase(React, renderToStaticMarkup, c), error: null };
    } catch (err) {
      return { name: c.name, html: null, error: err && err.message ? err.message : String(err) };
    }
  });
}

function snapshotPath(name) {
  return path.join(SNAP_DIR, `${name}.html`);
}

function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  const listOnly = args.includes("--list");

  const cases = loadHarness();
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");

  if (listOnly) {
    for (const c of cases) console.log(c.name);
    console.log(`\n${cases.length} case(s).`);
    return 0;
  }

  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

  let pass = 0;
  let fail = 0;
  let wrote = 0;
  const failures = [];

  for (const c of cases) {
    const file = path.join(SNAP_DIR, `${c.name}.html`);
    let actual;
    try {
      actual = renderCase(React, renderToStaticMarkup, c);
    } catch (err) {
      fail += 1;
      failures.push(c.name);
      console.log(`  XX  ${c.name} — RENDER THREW: ${err && err.message ? err.message : err}`);
      continue;
    }

    if (update) {
      const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
      fs.writeFileSync(file, actual);
      if (prev !== actual) wrote += 1;
      console.log(`  ++  ${c.name}${prev === null ? " (new)" : prev !== actual ? " (changed)" : " (same)"}`);
      pass += 1;
      continue;
    }

    if (!fs.existsSync(file)) {
      fail += 1;
      failures.push(c.name);
      console.log(`  XX  ${c.name} — NO SNAPSHOT (run with --update)`);
      continue;
    }
    const expected = fs.readFileSync(file, "utf8");
    if (expected === actual) {
      pass += 1;
      console.log(`  OK  ${c.name}`);
    } else {
      fail += 1;
      failures.push(c.name);
      console.log(`  XX  ${c.name} — SNAPSHOT MISMATCH`);
    }
  }

  console.log("");
  if (update) {
    console.log(`Visual regression: ${cases.length} case(s), ${wrote} snapshot(s) written/changed.`);
    return 0;
  }
  console.log(`Visual regression: ${pass} passed, ${fail} failed (of ${cases.length}).`);
  if (fail > 0) {
    console.log(`\nMismatched/failed: ${failures.join(", ")}`);
    console.log("If the change is intended, re-baseline with: npm run vr:update");
  }
  return fail === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, renderAll, normalizeHtml, loadHarness, snapshotPath, SNAP_DIR };
