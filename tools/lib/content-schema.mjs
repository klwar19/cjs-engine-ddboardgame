// content-schema.mjs — Shared schema engine for the content tooling.
//
// One place owns: the format/category → schema maps, the dependency-free
// draft-07 validator (the subset our schemas use), schema resolution for a
// given file, and the canonical on-disk location for a content type. Both
// `content-lint.mjs` (the linter/CI gate) and `tools/author/*` (the
// authoring CLI) import this so there is exactly one validator and one
// source of truth for where content lives.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const SCHEMAS_DIR = path.join(ROOT, "data/schemas");

// Declared `_file.format` → schema filename.
export const FORMAT_TO_SCHEMA = {
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

// Filename → format (world files declare the generic cjs-collection format
// but are named skills.json / monsters.json / …).
export const FILENAME_TO_FORMAT = {
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
// CATEGORY_TO_TYPE map in js/core/content-manager.js).
export const CATEGORY_TO_SCHEMA = {
  "campaignQuests": "campaignQuests.schema.json",
  "campaignEvents": "campaignEvents.schema.json",
  "oracleTables": "oracleTables.schema.json",
  "travelMaps": "travelMaps.schema.json",
  "worldActivityPacks": "worldActivityPacks.schema.json",
  "storyDirectorPacks": "storyDirectorPacks.schema.json"
};

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

export function validate(value, schema, rootSchema, schemaPath, pathStr, errors) {
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

// ── Schema resolution + convenience ────────────────────────────────
// Load a schema by its filename in data/schemas/ (cached by absolute path).
export function loadSchemaByName(schemaName) {
  const schemaPath = path.join(SCHEMAS_DIR, schemaName);
  let schema = schemaCache.get(schemaPath);
  if (!schema) {
    schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    schemaCache.set(schemaPath, schema);
  }
  return { schema, schemaPath };
}

// Resolve the schema filename for a file. Precedence:
//   1. a declared `_file.format` that maps to a schema (e.g. cjs-skills);
//   2. a declared `_file.category` for campaign-side collections;
//   3. the filename fallback (world files declare the generic
//      cjs-collection format but are named skills.json / monsters.json / …).
export function schemaNameFor(absPath, payload) {
  const baseName = path.basename(absPath);
  const declared = payload?._file?.format;
  if (declared && FORMAT_TO_SCHEMA[declared]) return FORMAT_TO_SCHEMA[declared];
  const category = payload?._file?.category;
  if (category && CATEGORY_TO_SCHEMA[category]) return CATEGORY_TO_SCHEMA[category];
  const byName = FILENAME_TO_FORMAT[baseName];
  if (byName && FORMAT_TO_SCHEMA[byName]) return FORMAT_TO_SCHEMA[byName];
  return null;
}

// Validate a whole `{ _file, entries }` document against a named schema.
// Returns an array of human-readable error strings (empty = valid).
export function validateDocument(doc, schemaName, rootPath = "$") {
  const { schema, schemaPath } = loadSchemaByName(schemaName);
  const errors = [];
  validate(doc, schema, schema, schemaPath, rootPath, errors);
  return errors;
}
