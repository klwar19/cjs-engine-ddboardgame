// content-refs.mjs — Lightweight cross-reference index over the content tree.
//
// Used by the patch-and-validate flow to answer "what else references this
// id?" — so a generator learns the blast radius of a change and gets warned
// when a removal would leave dangling references (e.g. a removed skill still
// listed in a monster's skill kit).
//
// The scan is generic: it walks every authored entry and records where a
// given id appears as a *value* (in any field, array, or nested object),
// excluding an entry's own top-level `id` (its definition). Engine ids are
// snake_case and namespaced enough that value-equality is a reliable signal
// without per-type reference-field wiring.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content-schema.mjs";

const CONTENT_ROOTS = ["data/universal", "data/system", "data/worlds", "data/campaigns"];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name.startsWith("_")) continue;
      walk(p, out);
      continue;
    }
    if (!name.endsWith(".json")) continue;
    if (name.startsWith("_") && name !== "_meta.json") continue;
    out.push(p);
  }
}

// Load every content file once: { relPath, category, entries }.
export function loadContentFiles() {
  const files = [];
  for (const r of CONTENT_ROOTS) walk(path.join(ROOT, r), files);
  const out = [];
  for (const abs of files) {
    let data;
    try { data = JSON.parse(fs.readFileSync(abs, "utf8")); } catch { continue; }
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    out.push({
      relPath: path.relative(ROOT, abs).split(path.sep).join("/"),
      category: data?._file?.category || null,
      world: data?._file?.world || null,
      entries
    });
  }
  return out;
}

// Map of entry id -> [{ relPath, category }] (top-level entry ids only).
export function buildIdIndex(files = loadContentFiles()) {
  const index = new Map();
  for (const f of files) {
    for (const e of f.entries) {
      if (!e || typeof e.id !== "string") continue;
      if (!index.has(e.id)) index.set(e.id, []);
      index.get(e.id).push({ relPath: f.relPath, category: f.category });
    }
  }
  return index;
}

// Record every JSON path inside `node` whose string value equals `target`.
function deepFindString(node, target, p, hits) {
  if (typeof node === "string") {
    if (node === target) hits.push(p);
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) deepFindString(node[i], target, `${p}[${i}]`, hits);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) deepFindString(v, target, p ? `${p}.${k}` : k, hits);
  }
}

// Find references to `id` across the tree. A reference is `id` appearing as a
// value anywhere in an entry EXCEPT that entry's own top-level `id`. Optionally
// skip a file (the patch's own target) and the defining entry.
export function findReferences(id, files = loadContentFiles(), opts = {}) {
  const refs = [];
  for (const f of files) {
    if (opts.excludeFile && f.relPath === opts.excludeFile) continue;
    for (const e of f.entries) {
      if (!e || typeof e !== "object") continue;
      const hits = [];
      deepFindString(e, id, "", hits);
      for (const hitPath of hits) {
        if (hitPath === "id") continue; // the entry's own definition, not a reference
        refs.push({ relPath: f.relPath, category: f.category, entryId: e.id, path: hitPath });
      }
    }
  }
  return refs;
}
