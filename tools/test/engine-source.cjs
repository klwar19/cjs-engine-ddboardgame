// engine-source.cjs — the Node test harnesses' shared engine-module loader.
//
// Tier 3 (engine JS → TS) moves `js/<area>/<mod>.js` to
// `src/engine/<area>/<mod>.ts` one module at a time. The ~8 harnesses that
// `vm.runInContext` / `eval` the engine in dependency order used to read the
// raw `.js` directly, which breaks the instant a module becomes `.ts`. This
// resolver makes the swap transparent: it prefers a TS port in `src/engine/`,
// transpiles it to a plain script (so it installs `window.CJS.*` exactly like
// the legacy IIFE did when run in the sandbox), and otherwise returns the
// legacy `.js` source unchanged. Harnesses just call `loadEngineSource(name)`
// instead of `fs.readFileSync(js path)`.
//
// The engine modules read each other via `window.CJS.*` (not ES imports) and
// are loaded in dependency order, so `module: None` transpilation (no
// require/exports wrapper) is correct and preserves that model.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
let ts = null;

// Resolve a logical engine module to its on-disk source location, preferring a
// TS port. Accepts "core/x.js", "core/x", or "js/core/x.js".
function resolveEngine(name) {
  const base = String(name).replace(/^js\//, "").replace(/\.[jt]s$/, "");
  const tsPath = path.join(ROOT, "src", "engine", `${base}.ts`);
  if (fs.existsSync(tsPath)) return { path: tsPath, isTs: true, base };
  return { path: path.join(ROOT, "js", `${base}.js`), isTs: false, base };
}

// Runnable script source for an engine module: legacy `.js` verbatim, or a TS
// port transpiled to a wrapper-free script (types stripped, no module system).
function loadEngineSource(name) {
  const { path: filePath, isTs } = resolveEngine(name);
  const src = fs.readFileSync(filePath, "utf8");
  if (!isTs) return src;
  if (!ts) ts = require("typescript");
  return ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None
    },
    fileName: filePath
  }).outputText;
}

module.exports = { loadEngineSource, resolveEngine };
