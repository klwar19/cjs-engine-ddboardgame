// test_launcher_switching.js - launcher mode switching contract.
//
// The launcher is the only cross-mode shell. These checks keep the important
// behavior from drifting: mode pages stay mounted after first visit, inactive
// frames are hidden without display:none teardown, active/inactive state is
// posted into each iframe, and iframe pages install the shared embed bridge.
//
// Run: node test_launcher_switching.js

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

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

function loadTsModule(relPath, requireMap = {}) {
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
  const fn = new Function("module", "exports", "require", out.outputText);
  fn(mod, mod.exports, (id) => {
    if (requireMap[id]) return requireMap[id];
    return require(id);
  });
  return mod.exports;
}

console.log("Launcher switching tests");

const app = read("src/launcher/App.tsx");
const frame = read("src/launcher/components/FrameView.tsx");
const modes = read("src/launcher/modes.ts");
const switching = read("src/launcher/switching.ts");
const hash = read("src/launcher/hooks/useHashMode.ts");
const sidebar = read("src/launcher/components/Sidebar.tsx");
const topbar = read("src/launcher/components/TopBar.tsx");
const embed = read("src/shared/embed.ts");
const css = read("css/launcher.css");
const pkg = JSON.parse(read("package.json"));
const vite = read("vite.config.mjs");
const index = read("index.html");

const modesMod = loadTsModule("src/launcher/modes.ts");
const switchingMod = loadTsModule("src/launcher/switching.ts", { "./modes": modesMod });

ok("index.html boots the launcher entry", index.includes("./src/launcher/main.tsx"));
ok("vite builds index.html as the app shell", /index:\s*resolve\(root,\s*"index\.html"\)/.test(vite));
for (const file of ["campaign.html", "combat.html", "editor.html", "minigames.html", "tests.html"]) {
  ok("vite builds mode page " + file, vite.includes('"' + file + '"'));
  ok("mode file exists: " + file, fs.existsSync(path.join(__dirname, file)));
}

for (const id of ["campaign", "combat", "editor", "minigames", "tests"]) {
  ok("MODES defines " + id, new RegExp("\\b" + id + "\\s*:").test(modes));
}
ok("mode icons are ASCII text tokens",
   Object.values(modesMod.MODES).every((cfg) => /^[A-Z]{2}$/.test(cfg.icon)));
ok("iframe URLs carry the launcher embed flag", /EMBED_FLAG\s*=\s*"embed=launcher"/.test(modes));
ok("appendLauncherEmbedFlag appends simple URLs",
   modesMod.appendLauncherEmbedFlag("campaign.html") === "campaign.html?embed=launcher");
ok("appendLauncherEmbedFlag preserves existing query",
   modesMod.appendLauncherEmbedFlag("campaign.html?debug=1") === "campaign.html?debug=1&embed=launcher");
ok("appendLauncherEmbedFlag preserves absolute paths",
   modesMod.appendLauncherEmbedFlag("/campaign.html") === "/campaign.html?embed=launcher");
ok("appendLauncherEmbedFlag replaces stale embed and keeps hash",
   (() => {
     const url = modesMod.appendLauncherEmbedFlag("campaign.html?embed=old&debug=1#story");
     return url.includes("embed=launcher") && !url.includes("embed=old") && url.endsWith("#story");
   })());
ok("buildIframeUrl uses appendLauncherEmbedFlag",
   modesMod.buildIframeUrl("campaign") === "campaign.html?embed=launcher");

ok("switching helper module exists", fs.existsSync(path.join(__dirname, "src/launcher/switching.ts")));
ok("readModeHash accepts normal mode hashes", switchingMod.readModeHash("#campaign") === "campaign");
ok("readModeHash ignores invalid hashes", switchingMod.readModeHash("#unknown") === null);
ok("readModeHash tolerates hash query tails", switchingMod.readModeHash("#combat?debug=1") === "combat");
ok("modeHash formats null and active modes",
   switchingMod.modeHash(null) === "" && switchingMod.modeHash("editor") === "#editor");
ok("launcherUrlForMode preserves path and query",
   switchingMod.launcherUrlForMode("/index.html", "?dev=1", "tests") === "/index.html?dev=1#tests");
{
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value)
  };
  switchingMod.writeStoredMode(storage, "minigames");
  ok("stored mode round-trips through helper", switchingMod.readStoredMode(storage) === "minigames");
  store.set(switchingMod.LAST_MODE_STORAGE_KEY, "invalid");
  ok("stored invalid mode is rejected", switchingMod.readStoredMode(storage) === null);
}
{
  const visited = ["campaign", "combat"];
  ok("rememberVisitedMode returns same ref for already visited mode",
     switchingMod.rememberVisitedMode(visited, "campaign", 5) === visited);
  ok("rememberVisitedMode appends new mode",
     JSON.stringify(switchingMod.rememberVisitedMode(visited, "editor", 5)) === JSON.stringify(["campaign", "combat", "editor"]));
  ok("rememberVisitedMode caps oldest frames when needed",
     JSON.stringify(switchingMod.rememberVisitedMode(visited, "editor", 2)) === JSON.stringify(["combat", "editor"]));
}

ok("App tracks visited modes in an ordered array", /useState<ReadonlyArray<ModeId>>/.test(app));
ok("visited mode updates use the pure helper", app.includes("rememberVisitedMode(prev, mode, MODE_IDS.length)"));
ok("preload lookup is ref-backed and stable",
   /visitedRef = useRef<Set<ModeId>>/.test(app) && app.includes("visitedRef.current.has(next)") && /\}, \[\]\);/.test(app));
ok("App keeps one FrameView per visited mode", /visited\.map\(\(m\) =>[\s\S]*<FrameView key=\{m\}/.test(app));
ok("App prefetches mode documents on intent", /rel = "prefetch"/.test(app) && /as = "document"/.test(app));
ok("Sidebar receives preload hook and collapsed state",
   /<Sidebar[\s\S]*collapsed=\{collapsed\}[\s\S]*onPreload=\{preloadMode\}/.test(app));
ok("WelcomeScreen receives preload hook", /<WelcomeScreen[\s\S]*onPreload=\{preloadMode\}/.test(app));

ok("Sidebar collapse affordance has active labels",
   sidebar.includes("Expand sidebar") && sidebar.includes("Collapse sidebar"));
ok("TopBar uses readable ASCII action text",
   />\s*Open in tab\s*</.test(topbar) && />\s*Menu\s*</.test(topbar));

ok("FrameView posts launcher visibility messages", frame.includes("postMessage") && frame.includes("LAUNCHER_VISIBILITY_EVENT"));
ok("FrameView posts after load and active changes", /onLoad=\{handleLoad\}/.test(frame) && /loaded\) postVisibility\(active\)/.test(frame));
ok("FrameView marks active state on the iframe", frame.includes('data-active={active ? "1" : "0"}'));
ok("FrameView keeps inactive iframe out of tab order", frame.includes("tabIndex={active ? 0 : -1}"));
ok("FrameView does not use the hidden attribute", !/\shidden=/.test(frame));

ok("CSS hides inactive frames without display:none", /\.launcher-frame\s*\{[\s\S]*visibility:\s*hidden/.test(css));
ok("CSS restores active frames", /\.launcher-frame\.is-active\s*\{[\s\S]*visibility:\s*visible/.test(css));
ok("CSS has no old hidden iframe display:none rule", !/\.launcher-frame\[hidden\]\s*\{\s*display:\s*none/.test(css));
ok("CSS keeps launcher card radius within design guidance", /border-radius:\s*8px/.test(css));
ok("CSS has focus-visible affordances", /:focus-visible/.test(css));
ok("mobile shell keeps the main frame on a full-width column",
   /@media \(max-width: 720px\)[\s\S]*\.launcher-shell\s*\{\s*grid-template-columns:\s*1fr;/.test(css) &&
   !/grid-template-columns:\s*0 1fr/.test(css) &&
   /\.launcher-main\s*\{\s*grid-column:\s*1;/.test(css));

ok("embed helper detects iframe or embed query", /window\.top !== window\.self/.test(embed) && /get\("embed"\) === "launcher"/.test(embed));
ok("embed helper installs cjs-embedded marker", /classList\.add\("cjs-embedded"\)/.test(embed));
ok("embed helper dispatches visibility CustomEvent", embed.includes("CustomEvent<LauncherVisibilityDetail>") && embed.includes("cjs:launcher-visibility"));
ok("embed helper exposes current visibility", /export function getLauncherVisibility/.test(embed));
ok("embed helper exposes a subscription helper", /export function onLauncherVisibilityChange/.test(embed));
for (const entry of ["src/campaign/main.tsx", "src/combat/main.tsx", "src/editor/main.tsx", "src/minigames/main.tsx", "src/entry-tests.js"]) {
  const src = read(entry);
  ok(entry + " calls markEmbeddedIfNeeded", src.includes("markEmbeddedIfNeeded()"));
}

ok("hash hook listens to hashchange", /addEventListener\("hashchange"/.test(hash));
ok("hash hook listens to popstate", /addEventListener\("popstate"/.test(hash));
ok("hash hook reads URL hash through helper", /readModeHash\(window\.location\.hash\)/.test(hash));
ok("hash hook persists externally-driven mode changes", /syncFromLocation[\s\S]*writeStoredMode\(localStorage, next\)/.test(hash));
ok("hash hook preserves path/query when pushing mode changes", /launcherUrlForMode\(window\.location\.pathname/.test(hash));

ok("npm test includes launcher switching test", pkg.scripts.test.includes("node test_launcher_switching.js"));

console.log("");
console.log("RESULTS: " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
