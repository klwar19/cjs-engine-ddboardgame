#!/usr/bin/env node
// build-ai-index.mjs — Generate compact AI indexes from the full content
// tree. Each compact file holds id, name, short tags, and a 1-sentence
// summary for every entry in its category. AI generators read these
// indexes for context (typically 1-5 KB total) rather than feeding the
// full multi-megabyte content packs into a prompt.
//
// Run after editing data/ or before shipping a build:
//   node tools/build-ai-index.mjs
//
// Outputs:
//   data/ai-index/skills.compact.json
//   data/ai-index/passives.compact.json
//   data/ai-index/statuses.compact.json
//   data/ai-index/items.compact.json
//   data/ai-index/monsters.compact.json
//   data/ai-index/characters.compact.json
//   data/ai-index/worlds.compact.json
//   data/ai-index/index.json   (top-level manifest with counts and timestamps)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data/ai-index");
fs.mkdirSync(outDir, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// One-sentence summary: prefer description, fall back to derived text.
function summarize(text, maxLen = 140) {
  if (!text) return undefined;
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).replace(/[\s,;:]+\S*$/, "") + "…";
}

function listWorldDirs() {
  const dir = path.join(root, "data/worlds");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => !n.startsWith("_") && fs.statSync(path.join(dir, n)).isDirectory())
    .map((n) => path.join(dir, n));
}

function readEntries(p, key = "entries") {
  if (!fs.existsSync(p)) return [];
  const data = readJson(p);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  // statuses.json fallback: keyed object.
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function dedupeById(arr) {
  const out = [];
  const seen = new Set();
  for (const e of arr) {
    const id = e?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

// ── Skills ─────────────────────────────────────────────────────────
function buildSkills() {
  const sources = [
    path.join(root, "data/universal/skills.json"),
    ...listWorldDirs().map((d) => path.join(d, "skills.json"))
  ];
  const all = [];
  for (const src of sources) {
    if (!fs.existsSync(src)) continue;
    for (const e of readEntries(src)) {
      all.push({
        id: e.id,
        name: e.name,
        element: e.element || undefined,
        damageType: e.damageType || undefined,
        power: typeof e.power === "number" ? e.power : 0,
        ap: typeof e.ap === "number" ? e.ap : 0,
        mp: typeof e.mp === "number" ? e.mp : 0,
        range: typeof e.range === "number" ? e.range : undefined,
        aoe: e.aoe || undefined,
        tags: Array.isArray(e.tags) && e.tags.length ? e.tags : undefined,
        summary: summarize(e.description)
      });
    }
  }
  return dedupeById(all);
}

// ── Passives ───────────────────────────────────────────────────────
function buildPassives() {
  const sources = [
    path.join(root, "data/universal/passives.json"),
    path.join(root, "data/universal/job_passives.json"),
    ...listWorldDirs().map((d) => path.join(d, "passives.json"))
  ];
  const all = [];
  for (const src of sources) {
    if (!fs.existsSync(src)) continue;
    for (const e of readEntries(src)) {
      all.push({
        id: e.id,
        name: e.name,
        tags: Array.isArray(e.tags) && e.tags.length ? e.tags : undefined,
        summary: summarize(e.description)
      });
    }
  }
  return dedupeById(all);
}

// ── Statuses ───────────────────────────────────────────────────────
function buildStatuses() {
  const src = path.join(root, "data/system/statuses.json");
  if (!fs.existsSync(src)) return [];
  const data = readJson(src);
  const entries = Array.isArray(data?.entries)
    ? data.entries
    : Object.values(data || {}).filter((v) => v && typeof v === "object" && v.id);
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category || undefined,
    summary: summarize(e.desc || e.description)
  })).filter((e) => e.id);
}

// ── Items / Materials / Food ───────────────────────────────────────
function buildItems() {
  const sources = [];
  for (const base of [path.join(root, "data/universal"), ...listWorldDirs()]) {
    for (const name of ["items.json", "materials.json", "food.json"]) {
      const f = path.join(base, name);
      if (fs.existsSync(f)) sources.push(f);
    }
  }
  const all = [];
  for (const src of sources) {
    for (const e of readEntries(src)) {
      if (!e?.id) continue;
      all.push({
        id: e.id,
        name: e.name,
        slot: e.slot || undefined,
        rarity: e.rarity || undefined,
        tags: Array.isArray(e.tags) && e.tags.length ? e.tags : undefined,
        summary: summarize(e.description)
      });
    }
  }
  return dedupeById(all);
}

// ── Monsters ──────────────────────────────────────────────────────
function buildMonsters() {
  const all = [];
  for (const worldDir of listWorldDirs()) {
    const worldId = path.basename(worldDir);
    const src = path.join(worldDir, "monsters.json");
    if (!fs.existsSync(src)) continue;
    for (const e of readEntries(src)) {
      const stats = e.stats || {};
      const skills = Array.isArray(e.skills)
        ? e.skills.map((s) => (typeof s === "string" ? s : s?.skillId)).filter(Boolean)
        : undefined;
      all.push({
        id: e.id,
        name: e.name,
        world: worldId,
        rank: e.rank || "?",
        hp: stats.E != null ? Number(stats.E) * 10 : undefined,
        weak: Array.isArray(e.weak) && e.weak.length ? e.weak : undefined,
        resist: Array.isArray(e.resist) && e.resist.length ? e.resist : undefined,
        skills: skills && skills.length ? skills.slice(0, 6) : undefined,
        tags: Array.isArray(e.tags) && e.tags.length ? e.tags : undefined,
        summary: summarize(e.description || e.tone)
      });
    }
  }
  return dedupeById(all);
}

// ── Characters (universal + world overrides) ──────────────────────
function buildCharacters() {
  const sources = [
    path.join(root, "data/universal/characters.json"),
    ...listWorldDirs().map((d) => path.join(d, "characters.json"))
  ];
  const all = [];
  for (const src of sources) {
    if (!fs.existsSync(src)) continue;
    for (const e of readEntries(src)) {
      if (!e?.id) continue;
      all.push({
        id: e.id,
        name: e.name,
        team: e.team,
        rank: e.rank || "?",
        tags: Array.isArray(e.tags) && e.tags.length ? e.tags : undefined,
        summary: summarize(e.description)
      });
    }
  }
  return dedupeById(all);
}

// ── Worlds ────────────────────────────────────────────────────────
function buildWorlds() {
  const out = [];
  for (const worldDir of listWorldDirs()) {
    const worldId = path.basename(worldDir);
    const metaPath = path.join(worldDir, "_meta.json");
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try { meta = readJson(metaPath); } catch { meta = {}; }
    }
    const world = meta.world || {};
    const monsterCount = fs.existsSync(path.join(worldDir, "monsters.json"))
      ? readEntries(path.join(worldDir, "monsters.json")).length : 0;
    const characterCount = fs.existsSync(path.join(worldDir, "characters.json"))
      ? readEntries(path.join(worldDir, "characters.json")).length : 0;
    const encounterCount = fs.existsSync(path.join(worldDir, "encounters.json"))
      ? readEntries(path.join(worldDir, "encounters.json")).length : 0;

    let storySummary = undefined;
    const sumPath = path.join(worldDir, "story_summary.md");
    if (fs.existsSync(sumPath)) {
      const text = fs.readFileSync(sumPath, "utf8");
      // Take first non-heading line as a 1-sentence pitch.
      const firstPara = text.split(/\n\s*\n/).find((p) => !p.trimStart().startsWith("#") && p.trim().length);
      storySummary = summarize(firstPara, 200);
    }

    out.push({
      id: worldId,
      displayName: world.displayName || worldId,
      ceiling: world.ceiling || "?",
      tone: world.tone || undefined,
      monsterCount, characterCount, encounterCount,
      status: world.status || undefined,
      summary: storySummary
    });
  }
  return out;
}

// ── Encounters compact (per-world) ─────────────────────────────────
function buildEncounters() {
  const all = [];
  for (const worldDir of listWorldDirs()) {
    const worldId = path.basename(worldDir);
    const src = path.join(worldDir, "encounters.json");
    if (!fs.existsSync(src)) continue;
    for (const e of readEntries(src)) {
      if (!e?.id) continue;
      const unitCount = Array.isArray(e.units) ? e.units.length : 0;
      all.push({
        id: e.id,
        name: e.name,
        world: worldId,
        size: `${e.width || 0}x${e.height || 0}`,
        units: unitCount,
        objectives: Array.isArray(e.objectives) ? e.objectives.length : 0,
        tags: Array.isArray(e.tags) && e.tags.length ? e.tags : undefined
      });
    }
  }
  return dedupeById(all);
}

// ── Write outputs ──────────────────────────────────────────────────
function writeJson(name, data) {
  const out = path.join(outDir, name);
  // Compact pretty-print: 2-space indent, but inline simple arrays.
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  return out;
}

const skills = buildSkills();
const passives = buildPassives();
const statuses = buildStatuses();
const items = buildItems();
const monsters = buildMonsters();
const characters = buildCharacters();
const worlds = buildWorlds();
const encounters = buildEncounters();

writeJson("skills.compact.json", skills);
writeJson("passives.compact.json", passives);
writeJson("statuses.compact.json", statuses);
writeJson("items.compact.json", items);
writeJson("monsters.compact.json", monsters);
writeJson("characters.compact.json", characters);
writeJson("worlds.compact.json", worlds);
writeJson("encounters.compact.json", encounters);

const manifest = {
  generatedAt: new Date().toISOString(),
  generator: "tools/build-ai-index.mjs",
  description: "Compact AI indexes. Use these to give an AI generator context about existing ids and tags without paying the token cost of full content files.",
  files: {
    "skills.compact.json": { count: skills.length },
    "passives.compact.json": { count: passives.length },
    "statuses.compact.json": { count: statuses.length },
    "items.compact.json": { count: items.length },
    "monsters.compact.json": { count: monsters.length },
    "characters.compact.json": { count: characters.length },
    "worlds.compact.json": { count: worlds.length },
    "encounters.compact.json": { count: encounters.length }
  }
};
writeJson("index.json", manifest);

const total = skills.length + passives.length + statuses.length
  + items.length + monsters.length + characters.length
  + worlds.length + encounters.length;
process.stdout.write(`build-ai-index: wrote ${Object.keys(manifest.files).length} files (${total} entries) → ${path.relative(root, outDir)}\n`);
