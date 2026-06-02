#!/usr/bin/env node
// build-size-check.mjs — Guard the build against silent size regressions, in
// two domains:
//
//   • CODE — every emitted JS/CSS chunk in dist/assets (hash stripped to a
//     stable logical key) is compared per-chunk to a committed baseline, plus
//     a code total. This kept the React migration's win (campaign-core
//     641 KB -> 271 KB; entry 457 KB -> 263 KB after lazy tabs).
//   • ASSETS — the copied media payload (images, audio, live2d, data — the
//     ~240 MB the build ships outside the JS bundle) is compared as a total
//     (and per top-level group), and the largest files are listed so an
//     oversized asset (e.g. an 8192px texture) is visible in CI.
//
// A domain fails when its total — or any tracked code chunk — grows past the
// threshold (5%) without an explicit baseline bump. Growth must also clear a
// small absolute floor so tiny chunks don't flap on sub-KB noise.
//
//   npm run build && npm run size:check     # verify against the baseline
//   npm run build && npm run size:baseline  # re-baseline after an intended change
//
// Exit codes: 0 within budget · 1 a chunk/total exceeded the threshold ·
// 2 no build present / usage error.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const distAssets = path.join(dist, "assets");
const baselinePath = path.join(__dirname, "build-size-baseline.json");
const artBudgetPath = path.join(__dirname, "art-budget.json");

const THRESHOLD_PCT = 5; // a chunk/total may not grow more than this %
const FLOOR_BYTES = 1024; // ...and must also clear this absolute delta to fail
const LARGE_ASSET_BYTES = 2 * 1024 * 1024; // assets above this are listed/noted
const LARGEST_N = 15; // how many of the biggest assets to record/report

const CODE_RE = /\.(js|css|html|map|webmanifest)$/;
const HASH_RE = /^(.*)-[A-Za-z0-9_-]{8}\.(js|css)$/;
const SOURCE_CAP_SKIP_DIRS = new Set([".git", "dist", "node_modules", "tmp"]);

const args = process.argv.slice(2);
const update = args.includes("--update") || args.includes("--baseline");

// ── helpers ────────────────────────────────────────────────────────────────
function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}
function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function pct(delta, base) {
  if (base === 0) return delta > 0 ? Infinity : 0;
  return (delta / base) * 100;
}

// Strip the content hash to a stable logical key. Vite emits [name]-[hash].ext
// with an 8-char hash that can itself contain '-' / '_'; the trailing
// `-<8>.<ext>` is unambiguous because every name has exactly one extension.
function logicalName(file) {
  const m = HASH_RE.exec(file);
  return m ? `${m[1]}.${m[2]}` : file;
}

function ensureBuild() {
  if (!fs.existsSync(distAssets)) {
    console.error(
      `build-size-check: no build found at ${path.relative(root, distAssets)}.\n` +
        "Run `npm run build` first."
    );
    process.exit(2);
  }
}

// CODE: hash-stripped JS/CSS chunks in dist/assets.
function collectChunks() {
  const chunks = {};
  for (const file of fs.readdirSync(distAssets)) {
    if (!/\.(js|css)$/.test(file)) continue;
    const bytes = fs.statSync(path.join(distAssets, file)).size;
    const key = logicalName(file);
    chunks[key] = (chunks[key] || 0) + bytes;
  }
  return chunks;
}

// ASSETS: every non-code file under dist/, grouped by top-level segment, with
// a running total and the N largest tracked for visibility.
function collectAssets() {
  const groups = {};
  let total = 0;
  const largest = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      const rel = path.relative(dist, abs);
      if (CODE_RE.test(entry.name)) continue;
      if (rel === "sw.js" || rel === "registerSW.js") continue;
      const bytes = fs.statSync(abs).size;
      total += bytes;
      const group = rel.split(path.sep)[0];
      groups[group] = (groups[group] || 0) + bytes;
      largest.push({ path: rel.split(path.sep).join("/"), bytes });
    }
  };
  walk(dist);
  largest.sort((a, b) => b.bytes - a.bytes);
  return { total, groups, largest: largest.slice(0, LARGEST_N) };
}

function readArtBudget() {
  if (!fs.existsSync(artBudgetPath)) return {};
  return JSON.parse(fs.readFileSync(artBudgetPath, "utf8"));
}

function collectSourceFilesForCaps() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      const first = rel.split(path.sep)[0];
      if (SOURCE_CAP_SKIP_DIRS.has(first)) continue;
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        files.push({
          path: rel.split(path.sep).join("/"),
          bytes: fs.statSync(abs).size
        });
      }
    }
  };
  walk(root);
  return files;
}

function matchesCategoryCap(file, cap) {
  const prefix = String(cap.pathPrefix || "");
  if (!prefix || !file.path.startsWith(prefix)) return false;
  const extensions = Array.isArray(cap.extensions) ? cap.extensions : [];
  if (!extensions.length) return true;
  const lower = file.path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(String(ext).toLowerCase()));
}

function collectCategoryCapStatus() {
  const budget = readArtBudget();
  const caps = Array.isArray(budget.categoryCaps) ? budget.categoryCaps : [];
  if (!caps.length) return { results: [], violations: [] };

  const files = collectSourceFilesForCaps();
  const results = [];
  const violations = [];
  for (const cap of caps) {
    const group = String(cap.group || cap.pathPrefix || "unknown");
    const matches = files.filter((file) => matchesCategoryCap(file, cap));
    const total = matches.reduce((sum, file) => sum + file.bytes, 0);
    const largest = [...matches].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    const maxFileBytes = Number(cap.maxFileBytes || 0);
    const maxTotalBytes = Number(cap.maxTotalBytes || 0);
    const overFiles = maxFileBytes > 0
      ? largest.filter((file) => file.bytes > maxFileBytes)
      : [];
    const totalOver = maxTotalBytes > 0 && total > maxTotalBytes;

    const result = {
      group,
      count: matches.length,
      total,
      largest,
      maxFileBytes,
      maxTotalBytes,
      overFiles,
      totalOver
    };
    results.push(result);
    if (!matches.length || overFiles.length || totalOver) violations.push(result);
  }
  return { results, violations };
}

function reportCategoryCaps(status) {
  if (!status.results.length) return false;

  console.log("\nbuild-size-check: source media category caps");
  for (const r of status.results) {
    const biggest = r.largest[0];
    const biggestText = biggest ? `${fmtMB(biggest.bytes)} ${biggest.path}` : "no files";
    const fileFlag = r.overFiles.length ? "  <= file cap" : "";
    const totalFlag = r.totalOver ? "  <= total cap" : "";
    console.log(
      `    ${r.group.padEnd(21)} ${fmtMB(r.total).padStart(10)} / ${fmtMB(r.maxTotalBytes).padStart(10)} ` +
        `(${r.count} files; largest ${biggestText})${fileFlag}${totalFlag}`
    );
  }

  if (!status.violations.length) return false;

  console.log("\nSource media category cap(s) EXCEEDED:");
  for (const r of status.violations) {
    if (!r.count) {
      console.log(`  XX ${r.group}: no files matched its art-budget category cap.`);
    }
    for (const file of r.overFiles) {
      console.log(
        `  XX ${r.group}: ${file.path} is ${fmtMB(file.bytes)} ` +
          `(cap ${fmtMB(r.maxFileBytes)})`
      );
    }
    if (r.totalOver) {
      console.log(
        `  XX ${r.group}: total ${fmtMB(r.total)} exceeds cap ${fmtMB(r.maxTotalBytes)}`
      );
    }
  }
  return true;
}

function snapshot() {
  ensureBuild();
  const chunks = collectChunks();
  const codeTotal = Object.values(chunks).reduce((a, b) => a + b, 0);
  const assets = collectAssets();
  return { chunks, codeTotal, assets };
}

function writeBaseline(snap) {
  const payload = {
    _note:
      "Build size budget for tools/build-size-check.mjs. `code.chunks` keys are " +
      "hash-stripped chunk names (bytes); `assets` is the copied media payload " +
      "(bytes) grouped by top-level dir. Regenerate with `npm run size:baseline` " +
      `after an intentional size change. Threshold: ${THRESHOLD_PCT}% per chunk ` +
      `(and ${FLOOR_BYTES}B floor) and ${THRESHOLD_PCT}% per total. Source media ` +
      "category caps live in tools/art-budget.json and cannot be re-baselined here.",
    thresholdPct: THRESHOLD_PCT,
    floorBytes: FLOOR_BYTES,
    generated: new Date().toISOString().slice(0, 10),
    code: {
      total: snap.codeTotal,
      chunks: Object.fromEntries(
        Object.entries(snap.chunks).sort(([a], [b]) => a.localeCompare(b))
      )
    },
    assets: {
      total: snap.assets.total,
      groups: Object.fromEntries(
        Object.entries(snap.assets.groups).sort(([a], [b]) => a.localeCompare(b))
      ),
      largest: snap.assets.largest
    }
  };
  fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `build-size-check: wrote baseline — code ${fmtKB(snap.codeTotal)} ` +
      `(${Object.keys(snap.chunks).length} chunks), assets ${fmtMB(snap.assets.total)}.`
  );
}

const snap = snapshot();
const categoryCapStatus = collectCategoryCapStatus();

if (update) {
  if (reportCategoryCaps(categoryCapStatus)) {
    console.log("\nbuild-size-check: refusing to write a baseline while source media category caps fail.");
    process.exit(1);
  }
  writeBaseline(snap);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(
    "build-size-check: no baseline found. Create one with `npm run size:baseline`."
  );
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const baseCode = baseline.code || {};
const baseChunks = baseCode.chunks || {};
const baseAssets = baseline.assets || {};

let failed = false;

// ── CODE: per-chunk + total ──────────────────────────────────────────────
const chunkRegressions = [];
const newChunks = [];
const removedChunks = [];
for (const [name, cur] of Object.entries(snap.chunks)) {
  const base = baseChunks[name];
  if (base == null) {
    newChunks.push([name, cur]);
    continue;
  }
  const delta = cur - base;
  if (delta > FLOOR_BYTES && pct(delta, base) > THRESHOLD_PCT) {
    chunkRegressions.push({ name, base, cur, delta, p: pct(delta, base) });
  }
}
for (const name of Object.keys(baseChunks)) {
  if (snap.chunks[name] == null) removedChunks.push(name);
}
const codeBaseTotal = baseCode.total ?? Object.values(baseChunks).reduce((a, b) => a + b, 0);
const codeDelta = snap.codeTotal - codeBaseTotal;
const codeTotalRegressed = codeDelta > FLOOR_BYTES && pct(codeDelta, codeBaseTotal) > THRESHOLD_PCT;

console.log(
  `build-size-check: code ${fmtKB(snap.codeTotal)} vs ${fmtKB(codeBaseTotal)} ` +
    `(${codeDelta >= 0 ? "+" : ""}${fmtKB(codeDelta)}, ${pct(codeDelta, codeBaseTotal) >= 0 ? "+" : ""}${pct(codeDelta, codeBaseTotal).toFixed(1)}%)`
);

if (newChunks.length) {
  console.log("\nNew code chunks (not in baseline — bump if intended):");
  for (const [name, cur] of newChunks.sort((a, b) => b[1] - a[1])) {
    console.log(`  +  ${name}  ${fmtKB(cur)}`);
  }
}
if (removedChunks.length) {
  console.log("\nRemoved code chunks (in baseline, no longer emitted):");
  for (const name of removedChunks.sort()) console.log(`  -  ${name}`);
}

// ── ASSETS: total + per-group + largest ────────────────────────────────────
const assetBaseTotal = baseAssets.total ?? 0;
const assetDelta = snap.assets.total - assetBaseTotal;
const assetRegressed = assetDelta > FLOOR_BYTES && pct(assetDelta, assetBaseTotal) > THRESHOLD_PCT;

console.log(
  `\nbuild-size-check: assets ${fmtMB(snap.assets.total)} vs ${fmtMB(assetBaseTotal)} ` +
    `(${assetDelta >= 0 ? "+" : ""}${fmtMB(assetDelta)}, ${pct(assetDelta, assetBaseTotal) >= 0 ? "+" : ""}${pct(assetDelta, assetBaseTotal).toFixed(1)}%)`
);
const groupNames = new Set([
  ...Object.keys(snap.assets.groups),
  ...Object.keys(baseAssets.groups || {})
]);
for (const g of [...groupNames].sort()) {
  const cur = snap.assets.groups[g] || 0;
  const base = (baseAssets.groups || {})[g] || 0;
  const d = cur - base;
  const flag = d > FLOOR_BYTES && pct(d, base) > THRESHOLD_PCT ? "  <= grew" : "";
  console.log(`    ${g.padEnd(10)} ${fmtMB(cur).padStart(10)}  (${d >= 0 ? "+" : ""}${fmtMB(d)})${flag}`);
}

const oversized = snap.assets.largest.filter((a) => a.bytes >= LARGE_ASSET_BYTES);
if (oversized.length) {
  console.log(`\nLargest assets (>= ${fmtMB(LARGE_ASSET_BYTES)} — consider downscaling / lazy-loading):`);
  for (const a of oversized) console.log(`  !  ${fmtMB(a.bytes).padStart(10)}  ${a.path}`);
}

const categoryCapFailed = reportCategoryCaps(categoryCapStatus);

// ── verdict ─────────────────────────────────────────────────────────────────
if (chunkRegressions.length || codeTotalRegressed || assetRegressed || categoryCapFailed) {
  failed = true;
  console.log("\nSize budget EXCEEDED:");
  for (const r of chunkRegressions.sort((a, b) => b.delta - a.delta)) {
    console.log(
      `  XX ${r.name}: ${fmtKB(r.base)} -> ${fmtKB(r.cur)} ` +
        `(+${fmtKB(r.delta)}, +${r.p.toFixed(1)}% > ${THRESHOLD_PCT}%)`
    );
  }
  if (codeTotalRegressed) {
    console.log(`  XX code total: +${fmtKB(codeDelta)} (+${pct(codeDelta, codeBaseTotal).toFixed(1)}% > ${THRESHOLD_PCT}%)`);
  }
  if (assetRegressed) {
    console.log(`  XX assets total: +${fmtMB(assetDelta)} (+${pct(assetDelta, assetBaseTotal).toFixed(1)}% > ${THRESHOLD_PCT}%)`);
  }
  if (categoryCapFailed) {
    console.log("  XX source media category caps: see details above");
  }
  console.log(
    "\nIf this growth is intended, re-baseline with `npm run size:baseline` " +
      "and commit tools/build-size-baseline.json. Category cap failures must be fixed " +
      "or intentionally adjusted in tools/art-budget.json."
  );
}

if (failed) process.exit(1);
console.log("\nbuild-size-check: OK — code + assets + source media within budget.");
process.exit(0);
