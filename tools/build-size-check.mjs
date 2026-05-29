#!/usr/bin/env node
// build-size-check.mjs — Guard the bundle against silent size regressions.
//
// The React migration drove the campaign-core chunk from 641 KB to 271 KB
// (see MIGRATION_PHASE_D_PLAN.md). This check keeps that ground: it compares
// every emitted JS/CSS chunk in dist/assets to a committed baseline and fails
// when a chunk — or the total — grows past the threshold without an explicit
// baseline bump. Run it after a build (CI runs it after `npm run build`).
//
//   npm run build && npm run size:check     # verify against the baseline
//   npm run build && npm run size:baseline  # re-baseline after an intended change
//
// Chunk filenames carry an 8-char content hash ([name]-[hash].js); we strip it
// to a stable logical key ("campaign.js", "cjs-campaign-core.js", ...) so the
// baseline survives every rebuild. Growth must clear BOTH a percentage and a
// small absolute floor, so tiny chunks don't flap on sub-KB noise.
//
// Exit codes: 0 within budget · 1 a chunk/total exceeded the threshold ·
// 2 no build present / usage error.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distAssets = path.join(root, "dist", "assets");
const baselinePath = path.join(__dirname, "build-size-baseline.json");

const THRESHOLD_PCT = 5; // a chunk may not grow more than this %
const FLOOR_BYTES = 1024; // ...and must also clear this absolute delta to fail

const args = process.argv.slice(2);
const update = args.includes("--update") || args.includes("--baseline");

const HASH_RE = /^(.*)-[A-Za-z0-9_-]{8}\.(js|css)$/;

// Strip the content hash to a stable logical key. Vite emits [name]-[hash].ext
// with an 8-char hash that can itself contain '-' / '_'; the trailing
// `-<8>.<ext>` is unambiguous because every name has exactly one extension.
function logicalName(file) {
  const m = HASH_RE.exec(file);
  return m ? `${m[1]}.${m[2]}` : file;
}

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function collectSizes() {
  if (!fs.existsSync(distAssets)) {
    console.error(
      `build-size-check: no build found at ${path.relative(root, distAssets)}.\n` +
        "Run `npm run build` first."
    );
    process.exit(2);
  }
  const chunks = {};
  for (const file of fs.readdirSync(distAssets)) {
    if (!/\.(js|css)$/.test(file)) continue;
    const bytes = fs.statSync(path.join(distAssets, file)).size;
    const key = logicalName(file);
    // Defensive: if two hashes ever map to one logical name in a single build,
    // sum them so the budget still reflects everything shipped under that name.
    chunks[key] = (chunks[key] || 0) + bytes;
  }
  return chunks;
}

function totalOf(chunks) {
  return Object.values(chunks).reduce((a, b) => a + b, 0);
}

function writeBaseline(chunks) {
  const payload = {
    _note:
      "Build size budget for tools/build-size-check.mjs. Keys are hash-stripped " +
      "chunk names; values are bytes. Regenerate with `npm run size:baseline` " +
      "after an intentional size change. Threshold: " +
      `${THRESHOLD_PCT}% per chunk (and ${FLOOR_BYTES}B floor) + ${THRESHOLD_PCT}% total.`,
    thresholdPct: THRESHOLD_PCT,
    floorBytes: FLOOR_BYTES,
    generated: new Date().toISOString().slice(0, 10),
    total: totalOf(chunks),
    chunks: Object.fromEntries(Object.entries(chunks).sort(([a], [b]) => a.localeCompare(b)))
  };
  fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `build-size-check: wrote baseline (${Object.keys(chunks).length} chunks, ` +
      `${fmtKB(payload.total)}) to ${path.relative(root, baselinePath)}`
  );
}

const current = collectSizes();

if (update) {
  writeBaseline(current);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(
    "build-size-check: no baseline found. Create one with `npm run size:baseline`."
  );
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const baseChunks = baseline.chunks || {};

const regressions = [];
const newChunks = [];
const removedChunks = [];

for (const [name, cur] of Object.entries(current)) {
  const base = baseChunks[name];
  if (base == null) {
    newChunks.push([name, cur]);
    continue;
  }
  const delta = cur - base;
  const pct = base === 0 ? (cur > 0 ? Infinity : 0) : (delta / base) * 100;
  if (delta > FLOOR_BYTES && pct > THRESHOLD_PCT) {
    regressions.push({ name, base, cur, delta, pct });
  }
}
for (const name of Object.keys(baseChunks)) {
  if (current[name] == null) removedChunks.push(name);
}

const curTotal = totalOf(current);
const baseTotal = baseline.total ?? totalOf(baseChunks);
const totalDelta = curTotal - baseTotal;
const totalPct = baseTotal === 0 ? 0 : (totalDelta / baseTotal) * 100;
const totalRegressed = totalDelta > FLOOR_BYTES && totalPct > THRESHOLD_PCT;

console.log(
  `build-size-check: total ${fmtKB(curTotal)} vs baseline ${fmtKB(baseTotal)} ` +
    `(${totalDelta >= 0 ? "+" : ""}${fmtKB(totalDelta)}, ${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%)`
);

if (newChunks.length) {
  console.log("\nNew chunks (not in baseline — bump the baseline if intended):");
  for (const [name, cur] of newChunks.sort((a, b) => b[1] - a[1])) {
    console.log(`  +  ${name}  ${fmtKB(cur)}`);
  }
}
if (removedChunks.length) {
  console.log("\nRemoved chunks (in baseline, no longer emitted):");
  for (const name of removedChunks.sort()) console.log(`  -  ${name}`);
}

if (regressions.length || totalRegressed) {
  console.log("\nSize budget EXCEEDED:");
  for (const r of regressions.sort((a, b) => b.delta - a.delta)) {
    console.log(
      `  XX ${r.name}: ${fmtKB(r.base)} -> ${fmtKB(r.cur)} ` +
        `(+${fmtKB(r.delta)}, +${r.pct.toFixed(1)}% > ${THRESHOLD_PCT}%)`
    );
  }
  if (totalRegressed) {
    console.log(
      `  XX total: +${fmtKB(totalDelta)} (+${totalPct.toFixed(1)}% > ${THRESHOLD_PCT}%)`
    );
  }
  console.log(
    "\nIf this growth is intended, re-baseline with `npm run size:baseline` " +
      "and commit tools/build-size-baseline.json."
  );
  process.exit(1);
}

console.log("\nbuild-size-check: OK — every chunk within budget.");
process.exit(0);
