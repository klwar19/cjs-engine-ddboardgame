#!/usr/bin/env node
// content-lint.mjs — Validate authored CJS JSON content against the
// per-format schemas in `data/schemas/`. Runs without external deps so
// it can drop into CI without changing package.json's dep graph.
//
// What it checks:
//   1. The file envelope: `_file.version`, `_file.format`, `_file.scope`.
//   2. Each entry's required fields and primitive types, per schema.
//   3. ID conventions: lowercase snake_case, unique within a file.
//   4. Cross-references (skill ids on monsters, encounter unit ids on
//      characters, etc.) when both sides are present in the run.
//
// It deliberately does NOT execute the engine — schemas focus on shape,
// not engine semantics. The full engine validator (ContentValidator on
// window.CJS) covers semantics at boot. The schema lint gives content
// authors and AI generators a fast offline contract.
//
// The schema engine itself (maps + validator + resolution) lives in
// `tools/lib/content-schema.mjs`, shared with the authoring CLI
// (`tools/author/*`) so there is exactly one validator.
//
// Usage:
//   node tools/content-lint.mjs                 # full content tree
//   node tools/content-lint.mjs data/worlds/haven  # subset
//   node tools/content-lint.mjs --patch patch.json # validate a generator patch
//   node tools/content-lint.mjs --quiet          # only print failures

import fs from "node:fs";
import path from "node:path";
import {
  ROOT as root,
  FORMAT_TO_SCHEMA,
  CATEGORY_TO_SCHEMA,
  schemaNameFor,
  validateDocument
} from "./lib/content-schema.mjs";
import { loadContentFiles, buildIdIndex, findReferences } from "./lib/content-refs.mjs";

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const jsonOut = args.includes("--json");
const patchIdx = args.indexOf("--patch");
const patchPath = patchIdx >= 0 ? args[patchIdx + 1] : null;
// Positional targets are every non-flag arg, except the value that follows
// `--patch` (only when `--patch` is actually present — patchIdx + 1 is 0 when
// it isn't, which would otherwise drop a legitimate first positional target).
const targets = args.filter((a, i) => !a.startsWith("--") && !(patchIdx >= 0 && i === patchIdx + 1));

const diagnostics = [];
let checkedCount = 0; // files actually validated against a schema
function diag(level, file, message, context) {
  diagnostics.push({ level, file, message, context });
}

// ── File walking ───────────────────────────────────────────────────
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name.startsWith("_")) continue; // skip _legacy_bundle etc.
      walk(p, out);
      continue;
    }
    if (!name.endsWith(".json")) continue;
    if (name.startsWith("_") && name !== "_meta.json") continue;
    out.push(p);
  }
}

function lintFile(absPath) {
  let raw;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch (e) {
    diag("error", absPath, `read failed: ${e.message}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    diag("error", absPath, `JSON parse failed: ${e.message}`);
    return;
  }
  const schemaName = schemaNameFor(absPath, data);
  if (!schemaName) {
    diag("info", absPath, "no schema mapping (skipped)");
    return;
  }
  let errors;
  try {
    errors = validateDocument(data, schemaName, "$");
  } catch (e) {
    diag("warn", absPath, `schema ${schemaName} load failed: ${e.message}`);
    return;
  }
  checkedCount += 1;
  for (const err of errors) diag("error", absPath, err);

  // Cross-cutting linter rules: id uniqueness, lowercase snake_case.
  if (Array.isArray(data?.entries)) {
    const seen = new Map();
    for (let i = 0; i < data.entries.length; i += 1) {
      const e = data.entries[i];
      const id = e?.id;
      if (!id) continue;
      if (seen.has(id)) {
        diag("error", absPath, `duplicate entry id "${id}" at entries[${i}] (also entries[${seen.get(id)}])`);
      } else {
        seen.set(id, i);
      }
    }
  }
}

// Structured per-op report (for --json and the human impact summary).
const patchReport = [];

// A patch is either a single op ({ target, format, upserts, removes }) or a
// multi-file batch ({ patches: [op, …] }).
function normalizePatches(patch) {
  if (Array.isArray(patch?.patches)) return patch.patches;
  if (patch?.target && patch?.format) return [patch];
  return null;
}

function lintOnePatch(patchPath, op, files, idIndex) {
  if (!op?.target?.file || !op?.format) {
    diag("error", patchPath, "each patch op must declare target.file and format");
    return;
  }
  const targetRel = op.target.file;
  // A patch's `format` may be a content format (cjs-skills) or, for
  // campaign-side collections, a category (campaignQuests).
  const isCategory = !!CATEGORY_TO_SCHEMA[op.format];
  const schemaName = FORMAT_TO_SCHEMA[op.format] || CATEGORY_TO_SCHEMA[op.format];
  if (!schemaName) {
    diag("error", patchPath, `${targetRel}: unknown format "${op.format}"`);
    return;
  }
  // Materialise a synthetic file with the upserts to reuse the same schema.
  const fileMeta = {
    version: 1,
    format: isCategory ? "cjs-collection" : op.format,
    scope: op.target.world ? "world" : "universal"
  };
  if (isCategory) fileMeta.category = op.format;
  if (op.target.world) fileMeta.world = op.target.world;
  const upserts = Array.isArray(op.upserts) ? op.upserts : [];
  const removes = Array.isArray(op.removes) ? op.removes : [];
  const errors = validateDocument({ _file: fileMeta, entries: upserts }, schemaName, "$patch");
  for (const err of errors) diag("error", patchPath, `${targetRel}: ${err}`);

  // The category this upsert lands in: the engine merges all files of a
  // category into one bucket, so a same-category id elsewhere is a real
  // collision — but the same id in a different category (a skill and a
  // monster) is fine.
  const tgtAbs = path.join(root, targetRel);
  let targetCategory = isCategory ? op.format : null;
  if (fs.existsSync(tgtAbs)) {
    try { targetCategory = JSON.parse(fs.readFileSync(tgtAbs, "utf8"))?._file?.category || targetCategory; } catch { /* keep */ }
  }

  // ── Downstream impact (advisory — does not affect exit code) ──────
  const added = [];
  const updated = [];
  const affected = [];
  for (const u of upserts) {
    const id = u?.id;
    if (typeof id !== "string") continue;
    const locs = idIndex.get(id) || [];
    const here = locs.some((l) => l.relPath === targetRel);
    const sameCatElsewhere = locs.filter((l) => l.relPath !== targetRel && l.category === targetCategory);
    if (here) updated.push(id);
    else if (sameCatElsewhere.length) {
      updated.push(id);
      diag("warn", patchPath, `${targetRel}: upsert "${id}" is also defined in ${sameCatElsewhere.map((l) => l.relPath).join(", ")} (same category — the engine merges these, so ids must stay unique)`);
    } else added.push(id);
    const refs = findReferences(id, files, { excludeFile: targetRel });
    if (refs.length) {
      affected.push({ id, references: refs });
      diag("info", patchPath, `${targetRel}: "${id}" is referenced by ${refs.length} entr${refs.length === 1 ? "y" : "ies"} — review the blast radius`);
    }
  }

  const dangling = [];
  for (const id of removes) {
    if (!idIndex.has(id)) diag("info", patchPath, `${targetRel}: remove "${id}" — not in the current tree`);
    // References that survive the remove (a referrer also being removed is fine).
    const refs = findReferences(id, files).filter((r) => !removes.includes(r.entryId));
    if (refs.length) {
      dangling.push({ id, references: refs });
      const sample = refs.slice(0, 5).map((r) => `${r.relPath}:${r.entryId}.${r.path}`).join(", ");
      diag("warn", patchPath, `${targetRel}: removing "${id}" leaves ${refs.length} dangling reference(s): ${sample}${refs.length > 5 ? ", …" : ""}`);
    }
  }

  patchReport.push({
    file: targetRel, format: op.format, world: op.target.world || null,
    schemaErrors: errors.length, added, updated, removed: removes, affected, dangling
  });
}

function lintPatch(patchPath) {
  const raw = fs.readFileSync(patchPath, "utf8");
  let patch;
  try { patch = JSON.parse(raw); } catch (e) {
    diag("error", patchPath, `JSON parse failed: ${e.message}`);
    return;
  }
  const ops = normalizePatches(patch);
  if (!ops) {
    diag("error", patchPath, "patch must declare target.file + format, or a patches[] array");
    return;
  }
  const files = loadContentFiles();
  const idIndex = buildIdIndex(files);
  for (const op of ops) lintOnePatch(patchPath, op, files, idIndex);
}

// ── Run ────────────────────────────────────────────────────────────
const files = [];
if (patchPath) {
  lintPatch(path.resolve(root, patchPath));
} else if (targets.length === 0) {
  walk(path.join(root, "data/universal"), files);
  walk(path.join(root, "data/system"), files);
  walk(path.join(root, "data/worlds"), files);
  walk(path.join(root, "data/campaigns"), files);
  for (const f of files) lintFile(f);
} else {
  for (const t of targets) {
    const abs = path.resolve(root, t);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      const collected = [];
      walk(abs, collected);
      for (const f of collected) lintFile(f);
    } else {
      lintFile(abs);
    }
  }
}

const errors = diagnostics.filter((d) => d.level === "error");
const warnings = diagnostics.filter((d) => d.level === "warn");
const infos = diagnostics.filter((d) => d.level === "info");

// Machine-readable patch report for AI agents: a diff summary they can react
// to (what changed, what it affects, what a removal would break).
if (patchPath && jsonOut) {
  process.stdout.write(JSON.stringify({
    ok: errors.length === 0,
    errors: errors.map((d) => d.message),
    warnings: warnings.map((d) => d.message),
    patches: patchReport
  }, null, 2) + "\n");
  process.exit(errors.length > 0 ? 1 : 0);
}

if (!quiet) {
  for (const d of diagnostics) {
    const tag = d.level === "error" ? "ERROR" : d.level === "warn" ? "WARN " : "INFO ";
    const rel = path.relative(root, d.file);
    process.stdout.write(`${tag} ${rel}: ${d.message}\n`);
  }
}
const summary = (checkedCount > 0 || diagnostics.length > 0) ? `${checkedCount} checked` : "nothing checked";
process.stdout.write(`content-lint: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info, ${summary}\n`);
process.exit(errors.length > 0 ? 1 : 0);
