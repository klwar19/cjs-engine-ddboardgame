// test_icon.js — Phase K.3.2 icon-as-JSX foundation.
//
// The roster detail row (and the slot / pool / equipment views) emit
// icons through `UIIcons.renderIcon` HTML strings. K.3.2 replaces those
// with the JSX `<Icon>` (Icon.tsx) reading the typed `icon.ts` token. This
// test proves the JSX renders the SAME DOM the HTML string did, so the
// detail-row port is byte-compatible — the single intentional difference
// is the image variant swapping the inline `onerror=` attribute for a
// React `onError` handler (asserted structurally).
//
// Two layers (mirrors test_virtual_list.js / test_selector_store.js):
//   1. Pure logic — transpile + eval icon.ts, test className composition,
//      the UIIcons-less fallback token, and the alt precedence.
//   2. Parity render — load the REAL js/ui/ui-icons.js + Icon.tsx through
//      the project's own TS loader and compare `renderToStaticMarkup(<Icon/>)`
//      to `UIIcons.renderIcon(...)` for glyph / letter / image sources.
//
// Run: node test_icon.js

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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

console.log("Campaign icon-as-JSX tests (Phase K.3.2)");

// Collapse insignificant whitespace so the comparison ignores formatting
// (renderToStaticMarkup has no pretty-printing, but renderIcon's template
// strings carry newlines/indentation for the image variant).
function squash(html) {
  return String(html).replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
}

// ── Layer 1: pure logic (transpile + eval icon.ts) ──────────────────────────
function loadTsModule(relPath, sandboxWindow) {
  const abs = path.join(__dirname, relPath);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: abs
  });
  const mod = { exports: {} };
  // icon.ts reads `window.CJS.UIIcons`; give it a controllable window.
  const fn = new Function("module", "exports", "window", out.outputText);
  fn(mod, mod.exports, sandboxWindow);
  return mod.exports;
}

const iconPath = "src/campaign/util/icon.ts";
ok("icon.ts exists", fs.existsSync(path.join(__dirname, iconPath)));
ok("Icon.tsx exists", fs.existsSync(path.join(__dirname, "src/campaign/util/Icon.tsx")));

// (a) No UIIcons on the route → plain-glyph fallback (matches cui-portraits).
const noUiIcons = { CJS: {} };
const pureNoUi = loadTsModule(iconPath, { CJS: {} });
ok("iconClassName composes + trims (empty className)",
   pureNoUi.iconClassName("skill", "md", "") === "cjs-icon cjs-icon-md cjs-icon-skill");
ok("iconClassName includes extra className",
   pureNoUi.iconClassName("item", "sm", "extra") === "cjs-icon cjs-icon-sm cjs-icon-item extra");
ok("resolveIconToken fallback uses entity.icon glyph",
   pureNoUi.resolveIconToken({ icon: "🔥" }, "skill").value === "🔥");
ok("resolveIconToken fallback defaults skill glyph",
   pureNoUi.resolveIconToken({}, "skill").value === "⚔️");
ok("resolveIconToken fallback defaults passive glyph",
   pureNoUi.resolveIconToken({}, "passive").value === "🛡️");
ok("iconFallbackGlyph fallback is generic diamond",
   pureNoUi.iconFallbackGlyph("skill") === "◆");
ok("iconAltText prefers explicit alt",
   pureNoUi.iconAltText({ name: "Bow" }, { kind: "glyph", value: "🏹" }, "Custom") === "Custom");
ok("iconAltText falls back to entity.name",
   pureNoUi.iconAltText({ name: "Bow" }, { kind: "glyph", value: "🏹" }) === "Bow");
ok("iconAltText falls back to token alt",
   pureNoUi.iconAltText({}, { kind: "letter", value: "T", alt: "Tent" }) === "Tent");
void noUiIcons;

// (b) With the real UIIcons installed, resolveIconToken delegates to it.
const env = require("./tools/visual-regression/env.cjs").installEnv();
// Load the real engine icon module (an IIFE attaching to window.CJS.UIIcons).
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "js/ui/ui-icons.js"), "utf8"), {
  filename: "ui-icons.js"
});
const UIIcons = env.CJS.UIIcons;
ok("real UIIcons installed", !!UIIcons && typeof UIIcons.renderIcon === "function");

const pure = loadTsModule(iconPath, env);
ok("resolveIconToken delegates: image URL classified",
   pure.resolveIconToken({ icon: "images/items/sword.png" }, "item").kind === "image");
ok("resolveIconToken delegates: long ASCII label → letter",
   pure.resolveIconToken({ icon: "Tent" }, "item").kind === "letter");
ok("resolveIconToken delegates: emoji → glyph",
   pure.resolveIconToken({ icon: "🔮" }, "oracle").kind === "glyph");

// ── Layer 2: parity render (Icon.tsx vs UIIcons.renderIcon) ─────────────────
const { createLoader } = require("./tools/visual-regression/load-tsx.cjs");
const { load } = createLoader();
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { Icon } = load(path.join(__dirname, "src/campaign/util/Icon.tsx"));
ok("Icon is a function component", typeof Icon === "function");

function jsx(props) {
  return squash(renderToStaticMarkup(React.createElement(Icon, props)));
}
function html(entity, opts) {
  return squash(UIIcons.renderIcon(entity, opts));
}

// Glyph: byte-identical DOM.
{
  const entity = { icon: "🔮", name: "Oracle" };
  const opts = { kind: "oracle", size: "md", alt: "Oracle" };
  ok("glyph icon: JSX matches renderIcon", jsx({ entity, ...opts }) === html(entity, opts),
     jsx({ entity, ...opts }));
}
// Glyph with title + className.
{
  const entity = { icon: "⚔️" };
  const opts = { kind: "skill", size: "sm", title: "Slash", className: "campaign-x" };
  ok("glyph icon (+title/className): JSX matches renderIcon",
     jsx({ entity, ...opts }) === html(entity, opts), jsx({ entity, ...opts }));
}
// Letter: long ASCII label → first-letter glyph, byte-identical.
{
  const entity = { icon: "Tent", name: "Camp Tent" };
  const opts = { kind: "item", size: "md" };
  ok("letter icon: JSX matches renderIcon", jsx({ entity, ...opts }) === html(entity, opts),
     jsx({ entity, ...opts }));
}
// Default (no icon field) → category default glyph.
{
  const entity = { name: "Mystery" };
  const opts = { kind: "passive", size: "lg" };
  ok("default-glyph icon: JSX matches renderIcon", jsx({ entity, ...opts }) === html(entity, opts),
     jsx({ entity, ...opts }));
}
// Image: structural parity (img src + hidden fallback span). The inline
// onerror= attribute is intentionally a React onError handler instead, so
// the static markup differs there by design — assert the structure holds.
{
  const entity = { icon: "images/items/sword.png", name: "Sword" };
  const out = jsx({ entity, kind: "item", size: "md", alt: "Sword" });
  ok("image icon: renders <img> with src", /<img[^>]*src="images\/items\/sword\.png"/.test(out), out);
  ok("image icon: img carries alt", /<img[^>]*alt="Sword"/.test(out));
  ok("image icon: hidden glyph fallback present",
     /<span class="cjs-icon-fallback" style="display:none">/.test(out));
  ok("image icon: wrapper carries the composed class",
     /<span class="cjs-icon cjs-icon-md cjs-icon-item">/.test(out));
  // The React variant must NOT emit a literal inline onerror handler.
  ok("image icon: no inline onerror= attribute (React onError instead)", !/onerror=/.test(out));
}
// title omitted when falsy (no empty title="").
{
  const out = jsx({ entity: { icon: "🔥" }, kind: "skill" });
  ok("no title attribute when title is unset", !/title=/.test(out), out);
}

console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
