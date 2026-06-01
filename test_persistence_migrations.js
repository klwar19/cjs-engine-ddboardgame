// Persistence migration tests.
//
// These exercise the real TypeScript migration functions in-memory. The
// browser IndexedDB layer is intentionally tiny; the riskier contract is that
// old localStorage payloads are annotated, current payloads are left alone,
// and future schema versions are rejected instead of silently downgraded.

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

let pass = 0;
let fail = 0;
function ok(label, cond, info) {
  if (cond) {
    pass += 1;
    console.log("  OK  " + label + (info ? " (" + info + ")" : ""));
  } else {
    fail += 1;
    console.log("  XX  " + label + (info ? " (" + info + ")" : ""));
  }
}

function loadTsModule(relPath) {
  const abs = path.join(__dirname, relPath);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: abs
  });
  const mod = { exports: {} };
  const fn = new Function("module", "exports", out.outputText);
  fn(mod, mod.exports);
  return mod.exports;
}

console.log("Persistence migration tests");

const rel = "src/persistence/migrations.ts";
ok("migrations.ts exists", fs.existsSync(path.join(__dirname, rel)));

const {
  CURRENT_SAVE_SCHEMA_VERSION,
  CURRENT_CONTENT_DRAFT_SCHEMA_VERSION,
  migrateSavePayload,
  migrateContentDraft,
  UnsupportedPersistenceVersionError
} = loadTsModule(rel);

ok("migrateSavePayload is a function", typeof migrateSavePayload === "function");
ok("migrateContentDraft is a function", typeof migrateContentDraft === "function");

{
  const current = {
    saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    saveId: "save_current",
    saveVersion: 5,
    slotName: "Current"
  };
  const migrated = migrateSavePayload(current);
  ok("current save migration is a no-op reference", migrated === current);
}

{
  const old = { saveId: "save_old", saveVersion: 5, slotName: "Old" };
  const migrated = migrateSavePayload(old);
  ok("old save gets current schema version", migrated.saveSchemaVersion === CURRENT_SAVE_SCHEMA_VERSION);
  ok("old save migration preserves fields", migrated.saveId === old.saveId && migrated.slotName === old.slotName);
  ok("old save migration does not mutate input", old.saveSchemaVersion === undefined);
}

{
  let rejected = false;
  try {
    migrateSavePayload({ saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1, saveId: "future" });
  } catch (error) {
    rejected = error instanceof UnsupportedPersistenceVersionError;
  }
  ok("future save schema is rejected", rejected);
}

{
  const current = {
    contentDraftSchemaVersion: CURRENT_CONTENT_DRAFT_SCHEMA_VERSION,
    id: "editor-local-draft",
    kind: "editor-local-draft",
    json: "{}",
    savedAt: "2026-06-01T00:00:00.000Z"
  };
  const migrated = migrateContentDraft(current);
  ok("current content draft migration is a no-op reference", migrated === current);
}

{
  const old = { json: "{\"hello\":true}", savedAt: "2026-05-31T00:00:00.000Z", source: "autosave" };
  const migrated = migrateContentDraft(old);
  ok("old content draft gets current schema version",
     migrated.contentDraftSchemaVersion === CURRENT_CONTENT_DRAFT_SCHEMA_VERSION);
  ok("old content draft keeps json", migrated.json === old.json);
  ok("old content draft gets a kind", migrated.kind === "editor-local-draft");
  ok("old content draft migration does not mutate input", old.contentDraftSchemaVersion === undefined);
}

{
  let rejected = false;
  try {
    migrateContentDraft({ contentDraftSchemaVersion: CURRENT_CONTENT_DRAFT_SCHEMA_VERSION + 1, json: "{}" });
  } catch (error) {
    rejected = error instanceof UnsupportedPersistenceVersionError;
  }
  ok("future content draft schema is rejected", rejected);
}

console.log("");
console.log("RESULTS: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
