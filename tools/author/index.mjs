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
import { TYPES, SCAFFOLDS, scopeFor, envelopeFor } from "../lib/content-registry.mjs";

// A closed downstream pipe (e.g. `… | head`) should exit quietly, not throw.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); throw e; });

// ── Helpers ──────────────────────────────────────────────────────
function fail(msg) {
  process.stderr.write(`author: ${msg}\n`);
  process.exit(2);
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
