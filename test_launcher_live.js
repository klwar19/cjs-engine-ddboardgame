// test_launcher_live.js - DOM-backed launcher switching regression.
//
// This complements test_launcher_switching.js. The static test locks the
// source-level contract; this one mounts the real React launcher and clicks
// through the mobile/menu + iframe switching flow so stateful regressions are
// caught before a manual browser smoke is needed.
//
// Run: node test_launcher_live.js

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

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveModuleFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx")
  ];
  const hit = candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  if (!hit) throw new Error(`Cannot resolve module ${base}`);
  return hit;
}

function createTsLoader(root) {
  const cache = new Map();
  function load(absPath) {
    const abs = resolveModuleFile(absPath);
    if (cache.has(abs)) return cache.get(abs).exports;

    const src = fs.readFileSync(abs, "utf8");
    const out = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      },
      fileName: abs
    });

    const mod = { exports: {} };
    cache.set(abs, mod);
    const localRequire = (id) => {
      if (id.startsWith(".")) return load(path.resolve(path.dirname(abs), id));
      return require(id);
    };
    const fn = new Function("module", "exports", "require", out.outputText);
    fn(mod, mod.exports, localRequire);
    return mod.exports;
  }
  return (rel) => load(path.join(root, rel));
}

function click(window, el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function frameByMode(document, mode) {
  return document.querySelector(`iframe[data-mode="${mode}"]`);
}

(async () => {
  console.log("Launcher live switching regression");

  let Window;
  try {
    ({ Window } = await import("happy-dom"));
  } catch (error) {
    ok("happy-dom imports", false, String(error));
    console.log("\nRESULTS: " + pass + " passed, " + (fail || 1) + " failed");
    process.exit(1);
    return;
  }

  const window = new Window({
    url: "http://127.0.0.1:5173/index.html",
    width: 390,
    height: 844
  });
  const { document } = window;
  document.body.innerHTML = '<div id="launcher-root"></div>';

  for (const [key, value] of Object.entries({
    window,
    document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    history: window.history,
    location: window.location,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    HTMLIFrameElement: window.HTMLIFrameElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    CustomEvent: window.CustomEvent,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window)
  })) {
    Object.defineProperty(global, key, {
      configurable: true,
      writable: true,
      value
    });
  }

  const posted = [];
  Object.defineProperty(window.HTMLIFrameElement.prototype, "contentWindow", {
    configurable: true,
    get() {
      const iframe = this;
      return {
        postMessage(data, origin) {
          posted.push({ mode: iframe.getAttribute("data-mode"), data, origin });
        }
      };
    }
  });

  const rootDir = __dirname;
  const loadTs = createTsLoader(rootDir);
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { App } = loadTs("src/launcher/App.tsx");

  window.localStorage.clear();
  const root = createRoot(document.getElementById("launcher-root"));
  root.render(React.createElement(App));
  await wait(20);

  const shell = document.querySelector(".launcher-shell");
  ok("launcher shell renders", !!shell);
  ok("starts on welcome with no iframe", !!document.querySelector(".launcher-welcome:not([hidden])") && document.querySelectorAll("iframe").length === 0);

  const menu = document.getElementById("launcher-menu-toggle");
  ok("mobile menu button renders", !!menu);
  click(window, menu);
  await wait(20);
  ok("mobile menu opens shell drawer state", shell.classList.contains("is-mobile-open"));

  const campaignNav = document.querySelector('.launcher-nav-item[data-mode="campaign"]');
  ok("campaign nav button exists", !!campaignNav);
  click(window, campaignNav);
  await wait(30);

  const campaign = frameByMode(document, "campaign");
  ok("selecting campaign closes mobile menu", !shell.classList.contains("is-mobile-open"));
  ok("campaign iframe mounts once selected", !!campaign);
  ok("campaign iframe gets launcher embed URL", campaign?.getAttribute("src") === "campaign.html?embed=launcher");
  ok("campaign iframe is active and focusable", campaign?.dataset.active === "1" && campaign?.classList.contains("is-active") && campaign?.tabIndex === 0);
  ok("campaign selection updates hash and local storage", window.location.hash === "#campaign" && window.localStorage.getItem("cjs.launcher.lastMode") === "campaign");
  ok("campaign document prefetch is registered", !!document.querySelector('link[rel="prefetch"][data-cjs-launcher-prefetch="campaign"]'));

  campaign.dispatchEvent(new window.Event("load"));
  await wait(30);
  ok("campaign iframe records loaded state", campaign.dataset.loaded === "1");
  ok("campaign receives active visibility after load",
     posted.some((entry) => entry.mode === "campaign" && entry.data.type === "cjs:launcher-visibility" && entry.data.active === true));

  const combatNav = document.querySelector('.launcher-nav-item[data-mode="combat"]');
  ok("combat nav button exists", !!combatNav);
  click(window, combatNav);
  await wait(30);

  const combat = frameByMode(document, "combat");
  ok("switching mounts second iframe without unmounting first", !!combat && document.querySelectorAll("iframe").length === 2);
  ok("campaign iframe stays mounted but inactive", campaign.isConnected && campaign.dataset.active === "0" && campaign.getAttribute("aria-hidden") === "true" && campaign.tabIndex === -1);
  ok("combat iframe is active", combat?.dataset.active === "1" && combat?.classList.contains("is-active"));
  ok("loaded campaign receives inactive visibility on switch",
     posted.some((entry) => entry.mode === "campaign" && entry.data.active === false));

  combat.dispatchEvent(new window.Event("load"));
  await wait(30);
  ok("combat receives active visibility after load",
     posted.some((entry) => entry.mode === "combat" && entry.data.type === "cjs:launcher-visibility" && entry.data.active === true));

  click(window, campaignNav);
  await wait(30);
  ok("switching back reuses existing campaign iframe",
     frameByMode(document, "campaign") === campaign && document.querySelectorAll('iframe[data-mode="campaign"]').length === 1);
  ok("switching back restores campaign loaded/active state", campaign.dataset.loaded === "1" && campaign.dataset.active === "1");
  ok("inactive combat iframe remains mounted out of tab order", combat.isConnected && combat.dataset.active === "0" && combat.tabIndex === -1);

  click(window, menu);
  await wait(20);
  ok("mobile menu can reopen after mode switches", shell.classList.contains("is-mobile-open"));
  click(window, document.querySelector(".launcher-main"));
  await wait(20);
  ok("outside click closes mobile menu", !shell.classList.contains("is-mobile-open"));

  root.unmount();
  window.close();

  console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})();
