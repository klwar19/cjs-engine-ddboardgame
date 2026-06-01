// load-tsx.cjs — a tiny recursive CommonJS loader for the project's TS/TSX.
//
// The repo deliberately has NO test-time bundler (esbuild isn't exposed and
// jsdom isn't a dependency). The existing logic tests (test_selector_store.js,
// test_virtual_list.js) already transpile a SINGLE TS file in-memory with the
// installed `typescript` package and eval the CommonJS output. This module
// generalizes that to a whole import graph so we can render real React
// components in Node for the visual-regression harness (K.2):
//
//   • Relative imports (`./x`, `../y`) are resolved to .ts/.tsx/.js (and the
//     `/index` variants), transpiled with `ts.transpileModule`, cached, and
//     required recursively. `jsx: "react-jsx"` makes TSX emit
//     `react/jsx-runtime` calls — the same transform vite/esbuild use.
//   • Bare imports (`react`, `react-dom/server`, `react/jsx-runtime`) delegate
//     to Node's real `require`, so every component shares the ONE installed
//     React instance (a hard requirement for hooks + renderToStaticMarkup).
//   • Plain `.js` files (legacy vanilla helpers, when a test loads them)
//     load through Node's own require — they are CommonJS-free IIFEs that
//     attach to `window.CJS`, so they're handled by `loadVanillaGlobal`.
//
// No new dependency: just `typescript` + `react` + `react-dom`, all already
// installed. The transform matches `tsconfig.json` (jsx react-jsx, esnext libs
// erased to CJS), so what renders here is what ships.

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// ── Module resolution ──────────────────────────────────────────────────────
// Mirror tsconfig's "Bundler" resolution for the extension-less relative
// specifiers the source uses (`"../../util/cui-utils"`): try the exact path,
// then .ts/.tsx/.js, then the /index variants.
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx"];

function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [];
  if (path.extname(base)) candidates.push(base);
  for (const ext of RESOLVE_EXTS) candidates.push(base + ext);
  for (const ext of RESOLVE_EXTS) candidates.push(path.join(base, "index" + ext));
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  throw new Error(`Cannot resolve "${specifier}" from ${fromFile}`);
}

// ── Loader factory ───────────────────────────────────────────────────────────
function createLoader() {
  const cache = new Map(); // absPath -> module.exports

  function load(absPath) {
    if (cache.has(absPath)) return cache.get(absPath);

    const source = fs.readFileSync(absPath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        isolatedModules: true
      },
      fileName: absPath
    });

    const module = { exports: {} };
    cache.set(absPath, module.exports); // seed before eval to tolerate cycles

    const localRequire = (specifier) => {
      if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
        const resolved = resolveRelative(absPath, specifier);
        const exports = load(resolved);
        // Re-sync the cache export reference in case the child reassigned
        // module.exports (the seed above is the initial {}).
        return exports;
      }
      // Bare specifier → the real installed package (shared React instance).
      return require(specifier);
    };

    const fn = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      outputText
    );
    fn(module.exports, localRequire, module, absPath, path.dirname(absPath));
    cache.set(absPath, module.exports);
    return module.exports;
  }

  return { load, cache };
}

module.exports = { createLoader, resolveRelative };
