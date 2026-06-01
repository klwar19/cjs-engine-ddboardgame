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

console.log("Launcher switching tests");

const app = read("src/launcher/App.tsx");
const frame = read("src/launcher/components/FrameView.tsx");
const modes = read("src/launcher/modes.ts");
const hash = read("src/launcher/hooks/useHashMode.ts");
const embed = read("src/shared/embed.ts");
const css = read("css/launcher.css");
const pkg = JSON.parse(read("package.json"));
const vite = read("vite.config.mjs");
const index = read("index.html");

ok("index.html boots the launcher entry", index.includes("./src/launcher/main.tsx"));
ok("vite builds index.html as the app shell", /index:\s*resolve\(root,\s*"index\.html"\)/.test(vite));
for (const file of ["campaign.html", "combat.html", "editor.html", "minigames.html", "tests.html"]) {
  ok("vite builds mode page " + file, vite.includes('"' + file + '"'));
  ok("mode file exists: " + file, fs.existsSync(path.join(__dirname, file)));
}

for (const id of ["campaign", "combat", "editor", "minigames", "tests"]) {
  ok("MODES defines " + id, new RegExp("\\b" + id + "\\s*:").test(modes));
}
ok("iframe URLs carry the launcher embed flag", /EMBED_FLAG\s*=\s*"embed=launcher"/.test(modes));
ok("buildIframeUrl appends the embed flag", /file\.includes\("\?"\)\s*\?\s*"&"\s*:\s*"\?"/.test(modes) && modes.includes("EMBED_FLAG"));

ok("App tracks visited modes in state", /useState<Set<ModeId>>/.test(app));
ok("visited mode updates are functional and idempotent", /setVisited\(\(prev\) =>/.test(app) && /prev\.has\(mode\)/.test(app));
ok("App keeps one FrameView per visited mode", /\[\.\.\.visited\]\.map/.test(app) && /<FrameView key=\{m\}/.test(app));
ok("App prefetches mode documents on intent", /rel = "prefetch"/.test(app) && /as = "document"/.test(app));
ok("Sidebar receives preload hook", /<Sidebar[\s\S]*onPreload=\{preloadMode\}/.test(app));
ok("WelcomeScreen receives preload hook", /<WelcomeScreen[\s\S]*onPreload=\{preloadMode\}/.test(app));

ok("FrameView posts launcher visibility messages", frame.includes("postMessage") && frame.includes("LAUNCHER_VISIBILITY_EVENT"));
ok("FrameView posts after load and active changes", /onLoad=\{handleLoad\}/.test(frame) && /loaded\) postVisibility\(active\)/.test(frame));
ok("FrameView marks active state on the iframe", frame.includes('data-active={active ? "1" : "0"}'));
ok("FrameView keeps inactive iframe out of tab order", frame.includes("tabIndex={active ? 0 : -1}"));
ok("FrameView does not use the hidden attribute", !/\shidden=/.test(frame));

ok("CSS hides inactive frames without display:none", /\.launcher-frame\s*\{[\s\S]*visibility:\s*hidden/.test(css));
ok("CSS restores active frames", /\.launcher-frame\.is-active\s*\{[\s\S]*visibility:\s*visible/.test(css));
ok("CSS has no old hidden iframe display:none rule", !/\.launcher-frame\[hidden\]\s*\{\s*display:\s*none/.test(css));

ok("embed helper detects iframe or embed query", /window\.top !== window\.self/.test(embed) && /get\("embed"\) === "launcher"/.test(embed));
ok("embed helper installs cjs-embedded marker", /classList\.add\("cjs-embedded"\)/.test(embed));
ok("embed helper dispatches visibility CustomEvent", embed.includes("CustomEvent<LauncherVisibilityDetail>") && embed.includes("cjs:launcher-visibility"));
for (const entry of ["src/campaign/main.tsx", "src/combat/main.tsx", "src/editor/main.tsx", "src/minigames/main.tsx", "src/entry-tests.js"]) {
  const src = read(entry);
  ok(entry + " calls markEmbeddedIfNeeded", src.includes("markEmbeddedIfNeeded()"));
}

ok("hash hook listens to hashchange", /addEventListener\("hashchange"/.test(hash));
ok("hash hook listens to popstate", /addEventListener\("popstate"/.test(hash));
ok("hash hook persists externally-driven mode changes", /syncFromLocation[\s\S]*writeStored\(next\)/.test(hash));

ok("npm test includes launcher switching test", pkg.scripts.test.includes("node test_launcher_switching.js"));

console.log("");
console.log("RESULTS: " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
