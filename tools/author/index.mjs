#!/usr/bin/env node
// tools/author/index.mjs — Content authoring CLI.
//
// One command-driven entry for scaffolding, validating, and writing authored
// content into the right place. It shares the validator with content-lint
// (tools/lib/content-schema.mjs), and — because the engine is manifest-first
// (data/_manifest.json lists every file it loads) — it also registers any
// new file in the manifest so the engine actually loads it. AI generators
// pipe a JSON entry on stdin and get the exact same validation a human does.
//
// Usage:
//   node tools/author/index.mjs --list
//   node tools/author/index.mjs <type> scaffold [--world <id>] [--file <name>]
//   node tools/author/index.mjs <type> validate < entry.json
//   node tools/author/index.mjs <type> add --world haven --file my_quests < entry.json
//   node tools/author/index.mjs <type> add ... --dry-run     # validate + preview, no write
//
//   scaffold | validate | add round-trips: the scaffold is always schema-valid.
//
// Flags:
//   --world <id>     world for world/campaign-scoped types
//   --file <name>    collection file basename (required for campaign types;
//                    optional override for core types, default <type>.json)
//   --in <path>      read entry JSON from a file instead of stdin
//   --target <path>  write to an explicit path (testing / non-standard layout)
//   --dry-run        validate and report planned changes without writing
//   --no-manifest    skip data/_manifest.json registration
//
// Input may be a single entry object, an array of entries, or a
// { "entries": [...] } document. `add` upserts each entry by `id`.

import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  validateDocument
} from "../lib/content-schema.mjs";

// A closed downstream pipe (e.g. `… | head`) should exit quietly, not throw.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); throw e; });

// ── Scaffolds (each is a schema-valid starter entry) ───────────────
function grid(w, h, cell = "empty") {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => cell));
}
const SCAFFOLDS = {
  skills: () => ({
    id: "new_skill", name: "New Skill", description: "What the skill does.",
    power: 10, ap: 1, mp: 0, damageType: "Physical", element: "Physical",
    scalingStat: "S", range: 1, aoe: null, tags: ["new"]
  }),
  passives: () => ({ id: "new_passive", name: "New Passive", description: "What the passive does.", tags: ["new"] }),
  statuses: () => ({ id: "new_status", name: "New Status", desc: "What the status does.", category: "buff", maxStacks: 1, defaultDuration: 2, tags: ["new"] }),
  items: () => ({ id: "new_item", name: "New Item", description: "What the item does.", rarity: "common", slot: "consumable", tags: ["new"] }),
  materials: () => ({ id: "new_material", name: "New Material", description: "A crafting material.", rarity: "common", tags: ["material"] }),
  food: () => ({ id: "new_food", name: "New Food", description: "A cookable ingredient or dish.", rarity: "common", tags: ["food"] }),
  characters: () => ({ id: "new_character", name: "New Character", team: "player", rank: "F", stats: { S: 5, P: 5, E: 6, C: 5, I: 5, A: 5, L: 5 }, skills: [], tags: ["new"] }),
  monsters: () => ({ id: "new_monster", name: "New Monster", team: "enemy", rank: "F", stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 }, skills: [], weak: [], resist: [], tags: ["new"] }),
  encounters: () => ({ id: "new_encounter", name: "New Encounter", width: 6, height: 6, grid: grid(6, 6), units: [{ id: "new_monster", pos: [2, 2] }] }),
  campaignQuests: (o) => ({
    id: "new_quest_set", name: "New Quest Set", world: o.world,
    templates: [{
      id: "new_quest", title: "New Quest", status: "idea", giver: "Quest Giver",
      summary: "One-line pitch for the quest.",
      objectives: [{ id: "obj_one", label: "Do the first thing", current: 0, required: 1 }],
      rewards: [{ op: "give_jp", amount: 1 }],
      tags: ["new"]
    }]
  }),
  campaignEvents: (o) => ({
    id: "new_event_table", name: "New Event Table", world: o.world,
    tags: ["new"], settings: ["town"],
    entries: [{
      weight: 10, id: "new_event", type: "social", title: "New Event",
      prompt: "A short description of what the party encounters.",
      suggested: [{ op: "log", text: "Something happened." }]
    }]
  }),
  oracleTables: (o) => ({
    id: "new_oracle", name: "New Oracle", world: o.world, defaultCanonRisk: "green",
    tables: { adjectives: ["cracked", "warm"], nouns: ["bell", "lantern"], verbs: ["remembers", "follows"] },
    prompts: [{ id: "new_prompt", text: "The cracked bell remembers something it should not.", suggestedUse: "Travel omen.", canonRisk: "green", tags: ["omen"] }]
  }),
  travelMaps: (o) => ({
    id: "new_travel_map", name: "New Travel Map", world: o.world,
    defaultLocationId: "loc_start", canvas: { width: 760, height: 430 },
    nodes: [
      { id: "loc_start", name: "Start", type: "base", x: 120, y: 200, description: "Where the route begins." },
      { id: "loc_next", name: "Next Stop", type: "scavenge", x: 420, y: 200, description: "The first place worth visiting." }
    ],
    links: [{ from: "loc_start", to: "loc_next", route: "road", time: 1, risk: "low" }]
  }),
  worldActivityPacks: (o) => ({
    id: "new_activity_pack", name: "New Activity Pack", version: 1, world: o.world,
    activities: [{
      id: "new_activity", type: "scavenge", title: "New Activity",
      locationIds: ["loc_start"], summary: "What the player does here.",
      buttonLabel: "Do It", rewardText: "materials +1",
      ops: [{ op: "give_material", id: "some_material", qty: 1 }]
    }]
  }),
  storyDirectorPacks: (o) => ({
    id: "new_story_director", name: "New Story Director", version: 1, world: o.world,
    summary: "Arc guidance for this world.", defaultCanonRisk: "green",
    stages: [{ id: "stage_one", name: "Opening", chapterMin: 1, chapterMax: 1, summary: "How the arc opens.", tags: ["intro"] }],
    sceneBeats: [{
      id: "beat_one", title: "Opening Beat", stageIds: ["stage_one"],
      canonRisk: "green", weight: 10, tags: ["intro"],
      prompt: "Something story-shaped the GM/solo player can drop in.",
      suggestedChoices: [{ label: "An option", ops: [{ op: "give_jp", amount: 1 }] }]
    }]
  })
};

// ── Type registry ──────────────────────────────────────────────────
// kind: core (universal or world), coreWorldOnly, system, campaign.
const TYPES = {
  skills: { schema: "skills.schema.json", category: "skills", kind: "core", filename: "skills.json" },
  passives: { schema: "passives.schema.json", category: "passives", kind: "core", filename: "passives.json" },
  items: { schema: "items.schema.json", category: "items", kind: "core", filename: "items.json" },
  materials: { schema: "items.schema.json", category: "materials", kind: "core", filename: "materials.json" },
  food: { schema: "items.schema.json", category: "food", kind: "core", filename: "food.json" },
  characters: { schema: "monsters.schema.json", category: "characters", kind: "core", filename: "characters.json" },
  monsters: { schema: "monsters.schema.json", category: "monsters", kind: "coreWorldOnly", filename: "monsters.json" },
  encounters: { schema: "encounters.schema.json", category: "encounters", kind: "coreWorldOnly", filename: "encounters.json" },
  statuses: { schema: "statuses.schema.json", category: "statuses", kind: "system", filename: "statuses.json", relDir: "data/system" },
  campaignQuests: { schema: "campaignQuests.schema.json", category: "campaignQuests", kind: "campaign", subdir: "quests", ext: ".json" },
  campaignEvents: { schema: "campaignEvents.schema.json", category: "campaignEvents", kind: "campaign", subdir: "events", ext: ".table.json" },
  oracleTables: { schema: "oracleTables.schema.json", category: "oracleTables", kind: "campaign", subdir: "oracles", ext: ".json" },
  travelMaps: { schema: "travelMaps.schema.json", category: "travelMaps", kind: "campaign", subdir: "travel_maps", ext: ".json" },
  worldActivityPacks: { schema: "worldActivityPacks.schema.json", category: "worldActivityPacks", kind: "campaign", subdir: "activity_packs", ext: ".json" },
  storyDirectorPacks: { schema: "storyDirectorPacks.schema.json", category: "storyDirectorPacks", kind: "campaign", subdir: "story_director", ext: ".json" }
};

// ── Helpers ──────────────────────────────────────────────────────
function fail(msg) {
  process.stderr.write(`author: ${msg}\n`);
  process.exit(2);
}

function scopeFor(cfg, opts) {
  if (cfg.kind === "system") return "system";
  if (cfg.kind === "campaign" || cfg.kind === "coreWorldOnly") return "world";
  return opts.world ? "world" : "universal"; // core
}

function envelopeFor(cfg, opts) {
  const scope = scopeFor(cfg, opts);
  const env = { version: 1, format: "cjs-collection", scope };
  // Only stamp `world` when we actually have one — a literal `world: undefined`
  // would otherwise trip the envelope's string check.
  if (scope === "world" && opts.world) env.world = opts.world;
  env.category = cfg.category;
  env.status = "active";
  return env;
}

// Resolve { absPath, relPath } for the target collection file.
function resolveTarget(cfg, opts) {
  if (opts.target) {
    const abs = path.isAbsolute(opts.target) ? opts.target : path.join(ROOT, opts.target);
    return { absPath: abs, relPath: toPosixRel(abs) };
  }
  let rel;
  if (cfg.kind === "campaign") {
    if (!opts.world) fail(`type "${opts.type}" requires --world <id>`);
    if (!opts.file) fail(`type "${opts.type}" requires --file <basename> (e.g. --file ${cfg.subdir}_pack)`);
    const base = opts.file.endsWith(cfg.ext) ? opts.file : opts.file + cfg.ext;
    rel = `data/campaigns/${opts.world}/${cfg.subdir}/${base}`;
  } else if (cfg.kind === "system") {
    rel = `${cfg.relDir}/${cfg.filename}`;
  } else {
    const base = opts.file ? (opts.file.endsWith(".json") ? opts.file : `${opts.file}.json`) : cfg.filename;
    if (cfg.kind === "coreWorldOnly" && !opts.world) fail(`type "${opts.type}" requires --world <id>`);
    rel = opts.world ? `data/worlds/${opts.world}/${base}` : `data/universal/${base}`;
  }
  return { absPath: path.join(ROOT, rel), relPath: rel };
}

function toPosixRel(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

// Read all of stdin synchronously. `fs.readFileSync(0)` throws EAGAIN when
// stdin is a non-blocking pipe, so loop on readSync, retrying EAGAIN until
// bytes arrive and stopping at EOF (0 bytes).
function readStdinSync() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  while (true) {
    let bytesRead;
    try {
      bytesRead = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === "EAGAIN") continue;
      if (e.code === "EOF") break;
      throw e;
    }
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readInputEntries(opts) {
  let raw;
  if (opts.in) {
    raw = fs.readFileSync(opts.in, "utf8");
  } else {
    if (process.stdin.isTTY) fail("provide --in <file> or pipe JSON entry(ies) on stdin");
    raw = readStdinSync();
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { fail(`input is not valid JSON: ${e.message}`); }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
  if (parsed && typeof parsed === "object") return [parsed];
  fail("input must be an entry object, an array, or a { entries: [...] } document");
}

function validateEntries(cfg, opts, entries) {
  const synthetic = { _file: envelopeFor(cfg, opts), entries };
  return validateDocument(synthetic, cfg.schema, "$");
}

function writeJson(absPath, doc, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(doc, null, 2) + "\n");
}

function upsertFile(cfg, opts, entries, dryRun) {
  const { absPath, relPath } = resolveTarget(cfg, opts);
  let doc;
  let created = false;
  if (fs.existsSync(absPath)) {
    doc = JSON.parse(fs.readFileSync(absPath, "utf8"));
    if (!Array.isArray(doc.entries)) doc.entries = [];
    if (!doc._file) doc._file = envelopeFor(cfg, opts);
    if (doc._file.category && doc._file.category !== cfg.category) {
      fail(`target ${relPath} is category "${doc._file.category}", not "${cfg.category}"`);
    }
  } else {
    doc = { _file: envelopeFor(cfg, opts), entries: [] };
    created = true;
  }
  let inserted = 0;
  let updated = 0;
  for (const entry of entries) {
    const idx = doc.entries.findIndex((e) => e && e.id === entry.id);
    if (idx >= 0) { doc.entries[idx] = entry; updated += 1; }
    else { doc.entries.push(entry); inserted += 1; }
  }
  writeJson(absPath, doc, dryRun);
  return { absPath, relPath, created, inserted, updated };
}

// Register the file in data/_manifest.json so the manifest-first engine loads
// it. Idempotent: verifies scope/world if already present, appends if not.
function ensureManifest(cfg, opts, relPath, dryRun) {
  if (opts.noManifest) return { skipped: "flag" };
  if (relPath.startsWith("..")) return { skipped: "outside-root" };
  const manPath = path.join(ROOT, "data/_manifest.json");
  const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
  const scope = scopeFor(cfg, opts);
  const existing = (man.files || []).find((f) => f.path === relPath);
  if (existing) {
    const issues = [];
    if (existing.scope !== scope) issues.push(`scope ${existing.scope}≠${scope}`);
    if (scope === "world" && existing.world !== opts.world) issues.push(`world ${existing.world}≠${opts.world}`);
    if (issues.length) fail(`manifest entry for ${relPath} mismatches: ${issues.join(", ")}`);
    return { alreadyRegistered: true };
  }
  const entry = { path: relPath, scope, category: cfg.category };
  if (scope === "world") entry.world = opts.world;
  man.files.push(entry);
  if (!dryRun) fs.writeFileSync(manPath, JSON.stringify(man, null, 2) + "\n");
  return { registered: true };
}

// ── Commands ─────────────────────────────────────────────────────
function parseFlags(rest) {
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--no-manifest") opts.noManifest = true;
    else if (a === "--world") opts.world = rest[++i];
    else if (a === "--file") opts.file = rest[++i];
    else if (a === "--in") opts.in = rest[++i];
    else if (a === "--target") opts.target = rest[++i];
    else fail(`unknown flag "${a}"`);
  }
  return opts;
}

function printUsage() {
  process.stdout.write(
    "Content authoring CLI\n\n" +
    "  node tools/author/index.mjs <type> <scaffold|validate|add> [flags]\n\n" +
    "Types:\n" +
    Object.keys(TYPES).map((t) => `  ${t}  (${TYPES[t].kind})`).join("\n") + "\n\n" +
    "Flags: --world <id> --file <name> --in <path> --target <path> --dry-run --no-manifest\n"
  );
}

function main(argv) {
  const [type, command, ...rest] = argv;
  if (!type || type === "--list" || type === "help" || type === "--help") {
    printUsage();
    process.exit(0);
  }
  const cfg = TYPES[type];
  if (!cfg) fail(`unknown type "${type}" (try --list)`);
  const opts = parseFlags(rest);
  opts.type = type;

  if (!command || command === "scaffold" || command === "new") {
    const entry = (SCAFFOLDS[type] || (() => ({ id: "new_entry", name: "New Entry" })))(opts);
    const doc = { _file: envelopeFor(cfg, opts), entries: [entry] };
    process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
    return;
  }

  if (command === "validate" || command === "add" || command === "upsert") {
    const entries = readInputEntries(opts);
    if (!entries.length) fail("no entries to process");
    const errors = validateEntries(cfg, opts, entries);
    if (errors.length) {
      process.stderr.write(`author: ${errors.length} validation error(s) for ${type}:\n`);
      for (const e of errors) process.stderr.write(`  - ${e}\n`);
      process.exit(1);
    }
    if (command === "validate") {
      process.stdout.write(`author: ${entries.length} ${type} entr${entries.length === 1 ? "y" : "ies"} valid\n`);
      return;
    }
    const res = upsertFile(cfg, opts, entries, opts.dryRun);
    const man = ensureManifest(cfg, opts, res.relPath, opts.dryRun);
    const verb = opts.dryRun ? "would write" : "wrote";
    const manNote = man.registered ? (opts.dryRun ? ", would register in manifest" : ", registered in manifest")
      : man.alreadyRegistered ? ""
      : man.skipped === "flag" ? ", manifest skipped (--no-manifest)"
      : man.skipped === "outside-root" ? ", manifest skipped (outside data/)"
      : "";
    process.stdout.write(
      `author: ${verb} ${res.relPath}${res.created ? " (new file)" : ""} — ` +
      `${res.inserted} added, ${res.updated} updated${manNote}\n`
    );
    return;
  }

  fail(`unknown command "${command}" (use scaffold | validate | add)`);
}

main(process.argv.slice(2));
