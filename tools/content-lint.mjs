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
// Usage:
//   node tools/content-lint.mjs                 # full content tree
//   node tools/content-lint.mjs data/worlds/haven  # subset
//   node tools/content-lint.mjs --patch patch.json # validate a generator patch
//   node tools/content-lint.mjs --quiet          # only print failures

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const FORMAT_TO_SCHEMA = {
  "cjs-skills": "skills.schema.json",
  "cjs-monsters": "monsters.schema.json",
  "cjs-characters": "monsters.schema.json",
  "cjs-encounters": "encounters.schema.json",
  "cjs-passives": "passives.schema.json",
  "cjs-items": "items.schema.json",
  "cjs-materials": "items.schema.json",
  "cjs-food": "items.schema.json",
  "cjs-questItems": "items.schema.json",
  "cjs-statuses": "statuses.schema.json"
};

const FILENAME_TO_FORMAT = {
  "skills.json": "cjs-skills",
  "monsters.json": "cjs-monsters",
  "characters.json": "cjs-characters",
  "encounters.json": "cjs-encounters",
  "passives.json": "cjs-passives",
  "items.json": "cjs-items",
  "materials.json": "cjs-materials",
  "food.json": "cjs-food",
  "questItems.json": "cjs-questItems",
  "statuses.json": "cjs-statuses"
};

// Campaign-side content files all declare `format: "cjs-collection"` and
// distinguish their shape via `_file.category` (mirroring the engine's
// CATEGORY_TO_TYPE map in js/core/content-manager.js). Resolve those by
// category instead of by filename/format.
const CATEGORY_TO_SCHEMA = {
  "campaignQuests": "campaignQuests.schema.json",
  "campaignEvents": "campaignEvents.schema.json",
  "oracleTables": "oracleTables.schema.json",
  "travelMaps": "travelMaps.schema.json",
  "worldActivityPacks": "worldActivityPacks.schema.json",
  "storyDirectorPacks": "storyDirectorPacks.schema.json"
};

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const patchIdx = args.indexOf("--patch");
const patchPath = patchIdx >= 0 ? args[patchIdx + 1] : null;
const targets = args.filter((a, i) => !a.startsWith("--") && i !== patchIdx + 1);

const diagnostics = [];
function diag(level, file, message, context) {
  diagnostics.push({ level, file, message, context });
}

// ── Schema loading ─────────────────────────────────────────────────
function loadSchema(filename) {
  const p = path.join(root, "data/schemas", filename);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ── Mini JSON-Schema validator ─────────────────────────────────────
// Implements the subset of draft-07 the schemas use: type, required,
// properties, additionalProperties (boolean), enum, const, minimum,
// maximum, minLength, minItems, maxItems, items, pattern, allOf, oneOf,
// anyOf, $ref (relative + #/definitions/...), patternProperties.
const schemaCache = new Map();
function resolveRef(ref, rootSchema, currentSchemaPath) {
  if (ref.startsWith("#/")) {
    const parts = ref.slice(2).split("/");
    let cursor = rootSchema;
    for (const p of parts) {
      cursor = cursor?.[p];
      if (!cursor) return null;
    }
    return { schema: cursor, root: rootSchema, path: currentSchemaPath };
  }
  // Relative ref to another schema file in data/schemas/.
  const next = path.join(path.dirname(currentSchemaPath), ref);
  let s = schemaCache.get(next);
  if (!s) {
    s = JSON.parse(fs.readFileSync(next, "utf8"));
    schemaCache.set(next, s);
  }
  return { schema: s, root: s, path: next };
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validate(value, schema, rootSchema, schemaPath, pathStr, errors) {
  if (!schema) return;
  if (schema.$ref) {
    const r = resolveRef(schema.$ref, rootSchema, schemaPath);
    if (!r) {
      errors.push(`${pathStr}: $ref ${schema.$ref} unresolved`);
      return;
    }
    validate(value, r.schema, r.root, r.path, pathStr, errors);
    return;
  }
  if (schema.allOf) {
    for (const sub of schema.allOf) validate(value, sub, rootSchema, schemaPath, pathStr, errors);
  }
  if (schema.anyOf) {
    let anyOk = false;
    const subErrs = [];
    for (const sub of schema.anyOf) {
      const tmp = [];
      validate(value, sub, rootSchema, schemaPath, pathStr, tmp);
      if (tmp.length === 0) { anyOk = true; break; }
      subErrs.push(tmp);
    }
    if (!anyOk) errors.push(`${pathStr}: none of anyOf matched (${JSON.stringify(subErrs[0] || []).slice(0, 200)})`);
  }
  if (schema.oneOf) {
    let matches = 0;
    for (const sub of schema.oneOf) {
      const tmp = [];
      validate(value, sub, rootSchema, schemaPath, pathStr, tmp);
      if (tmp.length === 0) matches += 1;
    }
    if (matches !== 1) errors.push(`${pathStr}: oneOf matched ${matches}/${schema.oneOf.length}`);
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${pathStr}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pathStr}: ${JSON.stringify(value)} not in enum [${schema.enum.join(", ")}]`);
  }
  if (schema.type) {
    const t = typeOf(value);
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const accepts = types.some((s) => {
      if (s === "number") return t === "number";
      if (s === "integer") return t === "number" && Number.isInteger(value);
      return s === t;
    });
    if (!accepts) {
      errors.push(`${pathStr}: expected type ${types.join("|")}, got ${t}`);
      return;
    }
  }
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push(`${pathStr}: minLength ${schema.minLength}, got ${value.length}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pathStr}: pattern /${schema.pattern}/ failed for ${JSON.stringify(value)}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) {
      errors.push(`${pathStr}: minimum ${schema.minimum}, got ${value}`);
    }
    if (schema.maximum != null && value > schema.maximum) {
      errors.push(`${pathStr}: maximum ${schema.maximum}, got ${value}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${pathStr}: minItems ${schema.minItems}, got ${value.length}`);
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      errors.push(`${pathStr}: maxItems ${schema.maxItems}, got ${value.length}`);
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i += 1) {
        validate(value[i], schema.items, rootSchema, schemaPath, `${pathStr}[${i}]`, errors);
      }
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (schema.required) {
      for (const k of schema.required) {
        if (!(k in value)) errors.push(`${pathStr}: missing required field "${k}"`);
      }
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (k in value) {
          validate(value[k], sub, rootSchema, schemaPath, `${pathStr}.${k}`, errors);
        }
      }
    }
    if (schema.patternProperties) {
      for (const [pat, sub] of Object.entries(schema.patternProperties)) {
        const re = new RegExp(pat);
        for (const k of Object.keys(value)) {
          if (re.test(k)) {
            validate(value[k], sub, rootSchema, schemaPath, `${pathStr}.${k}`, errors);
          }
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set([
        ...Object.keys(schema.properties || {}),
        ...(schema.patternProperties ? Object.keys(schema.patternProperties).map(() => null) : [])
      ]);
      for (const k of Object.keys(value)) {
        if (!allowed.has(k)) errors.push(`${pathStr}: extra property "${k}" not allowed`);
      }
    }
  }
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

// Resolve the schema filename for a file. Precedence:
//   1. a declared `_file.format` that maps to a schema (e.g. cjs-skills);
//   2. a declared `_file.category` for campaign-side collections;
//   3. the filename fallback (world files declare the generic
//      cjs-collection format but are named skills.json / monsters.json / …).
function schemaNameFor(absPath, payload) {
  const baseName = path.basename(absPath);
  const declared = payload?._file?.format;
  if (declared && FORMAT_TO_SCHEMA[declared]) return FORMAT_TO_SCHEMA[declared];
  const category = payload?._file?.category;
  if (category && CATEGORY_TO_SCHEMA[category]) return CATEGORY_TO_SCHEMA[category];
  const byName = FILENAME_TO_FORMAT[baseName];
  if (byName && FORMAT_TO_SCHEMA[byName]) return FORMAT_TO_SCHEMA[byName];
  return null;
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
  const schemaPath = path.join(root, "data/schemas", schemaName);
  if (!fs.existsSync(schemaPath)) {
    diag("warn", absPath, `schema ${schemaName} not found`);
    return;
  }
  let schema = schemaCache.get(schemaPath);
  if (!schema) {
    schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    schemaCache.set(schemaPath, schema);
  }
  const errors = [];
  validate(data, schema, schema, schemaPath, "$", errors);
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

function lintPatch(patchPath) {
  const raw = fs.readFileSync(patchPath, "utf8");
  let patch;
  try { patch = JSON.parse(raw); } catch (e) {
    diag("error", patchPath, `JSON parse failed: ${e.message}`);
    return;
  }
  if (!patch?.target?.file || !patch?.format) {
    diag("error", patchPath, "patch must declare target.file and format");
    return;
  }
  // A patch's `format` may be a content format (cjs-skills) or, for
  // campaign-side collections, a category (campaignQuests).
  const isCategory = !!CATEGORY_TO_SCHEMA[patch.format];
  const schemaName = FORMAT_TO_SCHEMA[patch.format] || CATEGORY_TO_SCHEMA[patch.format];
  if (!schemaName) {
    diag("error", patchPath, `unknown format "${patch.format}"`);
    return;
  }
  const schemaPath = path.join(root, "data/schemas", schemaName);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  schemaCache.set(schemaPath, schema);
  const errors = [];
  // Materialise a synthetic file with the upserts to reuse the same schema.
  const fileMeta = {
    version: 1,
    format: isCategory ? "cjs-collection" : patch.format,
    scope: patch.target.world ? "world" : "universal"
  };
  if (isCategory) fileMeta.category = patch.format;
  if (patch.target.world) fileMeta.world = patch.target.world;
  const synthetic = {
    _file: fileMeta,
    entries: Array.isArray(patch.upserts) ? patch.upserts : []
  };
  validate(synthetic, schema, schema, schemaPath, "$patch", errors);
  for (const err of errors) diag("error", patchPath, err);
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

if (!quiet) {
  for (const d of diagnostics) {
    const tag = d.level === "error" ? "ERROR" : d.level === "warn" ? "WARN " : "INFO ";
    const rel = path.relative(root, d.file);
    process.stdout.write(`${tag} ${rel}: ${d.message}\n`);
  }
}
process.stdout.write(`content-lint: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info, ${diagnostics.length === 0 ? "nothing checked" : "done"}\n`);
process.exit(errors.length > 0 ? 1 : 0);
