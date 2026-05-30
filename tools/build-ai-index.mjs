#!/usr/bin/env node
// build-ai-index.mjs — Generate compact AI indexes from the full content
// tree. Each compact file holds id, name, short tags, and a 1-sentence
// summary for every entry in its category. AI generators read these
// indexes for context (typically 1-5 KB total) rather than feeding the
// full multi-megabyte content packs into a prompt.
//
// Run after editing data/ or before shipping a build:
//   node tools/build-ai-index.mjs                      # writes to data/ai-index/
//   node tools/build-ai-index.mjs --out /tmp/foo       # writes elsewhere (CI / tests)
//
// Outputs:
//   <out>/skills.compact.json
//   <out>/passives.compact.json
//   <out>/statuses.compact.json
//   <out>/items.compact.json
//   <out>/monsters.compact.json
//   <out>/characters.compact.json
//   <out>/worlds.compact.json
//   <out>/index.json   (top-level manifest with counts and timestamps)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outOverride = outIdx >= 0 ? args[outIdx + 1] : null;
const outDir = outOverride
  ? path.resolve(process.cwd(), outOverride)
  : path.join(root, "data/ai-index");
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

// Campaign-side content lives under data/campaigns/<world>/<type>/*.json and
// is tagged by `_file.category` rather than filename. Walk the tree and
// return every top-level entry whose file matches the requested category,
// stamping the resolved world so the compact index can group by world.
function walkJsonFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("_")) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJsonFiles(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function readCampaignEntries(category) {
  const out = [];
  for (const file of walkJsonFiles(path.join(root, "data/campaigns"))) {
    let data;
    try { data = readJson(file); } catch { continue; }
    if (data?._file?.category !== category) continue;
    const world = data._file.world || path.basename(path.dirname(path.dirname(file)));
    for (const entry of (data.entries || [])) {
      if (entry && typeof entry === "object") out.push({ entry, world: entry.world || world });
    }
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

// ── Campaign quests (flattened to templates) ──────────────────────
function buildCampaignQuests() {
  const all = [];
  for (const { entry, world } of readCampaignEntries("campaignQuests")) {
    for (const t of (entry.templates || [])) {
      if (!t?.id) continue;
      all.push({
        id: t.id,
        title: t.title,
        world,
        set: entry.id,
        kind: t.kind || undefined,
        status: t.status || undefined,
        giver: t.giver || undefined,
        mapForm: t.mapForm || undefined,
        linkedScenario: t.linkedScenario || undefined,
        objectives: Array.isArray(t.objectives) ? t.objectives.length : 0,
        tags: Array.isArray(t.tags) && t.tags.length ? t.tags : undefined,
        summary: summarize(t.summary)
      });
    }
  }
  return dedupeById(all);
}

// ── Campaign events (flattened to rollable entries) ───────────────
function buildCampaignEvents() {
  const all = [];
  for (const { entry, world } of readCampaignEntries("campaignEvents")) {
    for (const ev of (entry.entries || [])) {
      if (!ev?.id) continue;
      all.push({
        id: ev.id,
        title: ev.title,
        world,
        table: entry.id,
        type: ev.type || undefined,
        weight: typeof ev.weight === "number" ? ev.weight : undefined,
        oracleTableId: ev.oracleTableId || undefined,
        tags: Array.isArray(ev.tags) && ev.tags.length ? ev.tags : undefined,
        summary: summarize(ev.prompt)
      });
    }
  }
  return dedupeById(all);
}

// ── Oracle tables (pack-level: keyword banks + prompt count) ───────
function buildOracleTables() {
  const all = [];
  for (const { entry, world } of readCampaignEntries("oracleTables")) {
    if (!entry?.id) continue;
    all.push({
      id: entry.id,
      name: entry.name,
      world,
      zone: entry.zone || undefined,
      defaultCanonRisk: entry.defaultCanonRisk || undefined,
      tableKeys: entry.tables && typeof entry.tables === "object" ? Object.keys(entry.tables) : undefined,
      prompts: Array.isArray(entry.prompts) ? entry.prompts.length : 0
    });
  }
  return dedupeById(all);
}

// ── Travel maps (pack-level: node ids + default location) ─────────
function buildTravelMaps() {
  const all = [];
  for (const { entry, world } of readCampaignEntries("travelMaps")) {
    if (!entry?.id) continue;
    const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
    all.push({
      id: entry.id,
      name: entry.name,
      world,
      zone: entry.zone || undefined,
      defaultLocationId: entry.defaultLocationId || undefined,
      nodeIds: nodes.map((n) => n?.id).filter(Boolean),
      links: Array.isArray(entry.links) ? entry.links.length : 0
    });
  }
  return dedupeById(all);
}

// ── World activities (flattened to addressable activities) ─────────
function buildWorldActivities() {
  const all = [];
  for (const { entry, world } of readCampaignEntries("worldActivityPacks")) {
    for (const a of (entry.activities || [])) {
      if (!a?.id) continue;
      all.push({
        id: a.id,
        title: a.title,
        world,
        pack: entry.id,
        type: a.type || undefined,
        locationIds: Array.isArray(a.locationIds) && a.locationIds.length ? a.locationIds : undefined,
        summary: summarize(a.summary)
      });
    }
  }
  return dedupeById(all);
}

// ── Story director packs (pack-level: arc shape) ──────────────────
function buildStoryDirector() {
  const all = [];
  for (const { entry, world } of readCampaignEntries("storyDirectorPacks")) {
    if (!entry?.id) continue;
    all.push({
      id: entry.id,
      name: entry.name,
      world,
      zone: entry.zone || undefined,
      stages: Array.isArray(entry.stages) ? entry.stages.length : 0,
      sceneBeats: Array.isArray(entry.sceneBeats) ? entry.sceneBeats.length : 0,
      metricIds: Array.isArray(entry.metrics) ? entry.metrics.map((m) => m?.id).filter(Boolean) : undefined,
      summary: summarize(entry.summary)
    });
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
// Campaign-side content (one compact file per campaign collection category).
const campaignQuests = buildCampaignQuests();
const campaignEvents = buildCampaignEvents();
const oracleTables = buildOracleTables();
const travelMaps = buildTravelMaps();
const worldActivities = buildWorldActivities();
const storyDirector = buildStoryDirector();

writeJson("skills.compact.json", skills);
writeJson("passives.compact.json", passives);
writeJson("statuses.compact.json", statuses);
writeJson("items.compact.json", items);
writeJson("monsters.compact.json", monsters);
writeJson("characters.compact.json", characters);
writeJson("worlds.compact.json", worlds);
writeJson("encounters.compact.json", encounters);
writeJson("campaignQuests.compact.json", campaignQuests);
writeJson("campaignEvents.compact.json", campaignEvents);
writeJson("oracleTables.compact.json", oracleTables);
writeJson("travelMaps.compact.json", travelMaps);
writeJson("worldActivities.compact.json", worldActivities);
writeJson("storyDirector.compact.json", storyDirector);

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
    "encounters.compact.json": { count: encounters.length },
    "campaignQuests.compact.json": { count: campaignQuests.length },
    "campaignEvents.compact.json": { count: campaignEvents.length },
    "oracleTables.compact.json": { count: oracleTables.length },
    "travelMaps.compact.json": { count: travelMaps.length },
    "worldActivities.compact.json": { count: worldActivities.length },
    "storyDirector.compact.json": { count: storyDirector.length }
  }
};
writeJson("index.json", manifest);

const total = Object.values(manifest.files).reduce((sum, f) => sum + f.count, 0);
process.stdout.write(`build-ai-index: wrote ${Object.keys(manifest.files).length} files (${total} entries) → ${path.relative(root, outDir)}\n`);
