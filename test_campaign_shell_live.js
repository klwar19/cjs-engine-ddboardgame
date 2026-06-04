// test_campaign_shell_live.js — DOM-backed campaign-shell smoke (Phase Tier 0).
//
// The static visual-regression harness (tools/visual-regression) renders each
// tab/chrome strip to STATIC markup with a stubbed engine — it can't catch
// RUNTIME wiring regressions. This test mounts the REAL <CampaignShell/> into a
// happy-dom document with react-dom/client and drives the interactions the
// React migration introduced, asserting the live DOM responds:
//
//   • boot: the shell mounts its chrome (header / mode bar / sub-tabs / rail)
//   • tab switch: clicking a sub-tab re-renders and moves the active marker
//   • drawer: a command-rail panel button opens the React PORTAL drawer
//     (createPortal to document.body) and the close button tears it down
//   • typed action: the GM rail button's onClick routes to CampaignUI.handleAction
//   • island marker: a data-* marker button inside a still-vanilla external-tab
//     body routes through the tab wrapper's dispatchHtmlIslandAction → handleAction
//   • PWA: the built dist (if present) ships the PNG icons + a manifest
//
// It reuses the visual-regression loader (in-memory TS/TSX transpile, no
// bundler) and its bounded window.CJS engine stub — the same surface the
// browser sees — extended with the shell boot + action surface a LIVE mount
// needs. No real browser, no new dependency (happy-dom is already a devDep),
// matching test_launcher_live.js.
//
// Run: node test_campaign_shell_live.js

const fs = require("node:fs");
const path = require("node:path");
const { createLoader } = require("./tools/visual-regression/load-tsx.cjs");

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
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
// Let React flush its concurrent work + resolve a lazy chunk's microtask.
const settle = async () => { for (let i = 0; i < 6; i += 1) await wait(15); };

function click(window, el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function installGlobals(window) {
  class ObserverStub { observe() {} unobserve() {} disconnect() {} }
  const matchMediaStub = () => ({
    matches: false, media: "", onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; }
  });
  const defs = {
    window,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    history: window.history,
    localStorage: window.localStorage,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    getComputedStyle: window.getComputedStyle ? window.getComputedStyle.bind(window) : () => ({ getPropertyValue: () => "" }),
    matchMedia: window.matchMedia ? window.matchMedia.bind(window) : matchMediaStub,
    ResizeObserver: window.ResizeObserver || ObserverStub,
    IntersectionObserver: window.IntersectionObserver || ObserverStub,
    queueMicrotask
  };
  for (const [k, v] of Object.entries(defs)) {
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  }
  // Mirror onto window so code reading window.X agrees with global X.
  window.ResizeObserver = defs.ResizeObserver;
  window.IntersectionObserver = defs.IntersectionObserver;
  if (!window.matchMedia) window.matchMedia = defs.matchMedia;
  if (!window.requestAnimationFrame) window.requestAnimationFrame = defs.requestAnimationFrame;
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = defs.cancelAnimationFrame;
  // React 19: declare a non-act environment so render() doesn't warn.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
}

(async () => {
  console.log("Campaign shell live smoke");
  process.env.TZ = "UTC";

  let Window;
  try {
    ({ Window } = await import("happy-dom"));
  } catch (error) {
    ok("happy-dom imports", false, String(error));
    console.log("\nRESULTS: " + pass + " passed, " + (fail || 1) + " failed");
    process.exit(1);
    return;
  }

  const window = new Window({ url: "http://127.0.0.1:5173/campaign.html", width: 1280, height: 800 });
  const { document } = window;
  document.body.innerHTML = '<div id="campaign-mount"></div>';
  installGlobals(window);

  const loader = createLoader();
  const SRC = path.resolve(__dirname, "src", "campaign");
  const VR = path.resolve(__dirname, "tools", "visual-regression");

  // 1. Real TS leaf-util modules self-install on CampaignUIInternal.* (browser parity).
  //    (cui-controls is no longer here: it's a pure util now — no namespace to
  //    install — pulled in via named imports by the tab data builders instead.)
  for (const m of [
    "cui-utils", "cui-portraits", "cui-log", "cui-modals",
    "cui-options", "cui-equipment", "cui-hub-tab", "cui-tabs-registry",
    "cui-world-map-tab", "cui-party-tab", "cui-react-bridge"
  ]) {
    loader.load(path.join(SRC, "util", `${m}.ts`));
  }

  // 2. The bounded window.CJS engine stub + the shared CampaignState fixture.
  const casesMod = loader.load(path.join(VR, "cases.tsx"));
  casesMod.installEngine();

  // 3. The real chrome-state singleton the components read — drive + assert via it.
  const chromeState = loader.load(path.join(SRC, "chrome-state.ts"));

  // 4. Extend window.CJS with the shell boot + dispatch surface a LIVE mount
  //    needs (the static VR never boots the shell, so installEngine omits it).
  const dispatched = [];
  const CJS = window.CJS;
  const fireRendered = () => document.dispatchEvent(new window.CustomEvent("campaign:rendered"));
  CJS.CampaignUI = {
    enableReactShell() {},
    init() { return Promise.resolve(); },
    render() { fireRendered(); },
    getMainBody() { return '<div class="campaign-empty">[vanilla fallback]</div>'; },
    renderDrawerBody() {
      return '<div class="campaign-drawer-island"><button class="island-act" data-add-note="1">+ Add note</button></div>';
    },
    setActivePanel(id) { chromeState.setActivePanel(id == null ? null : id); fireRendered(); },
    handleAction(name, data) { dispatched.push({ name, data }); },
    getBootIncompatibleNotice() { return null; },
    clearBootIncompatibleNotice() {}
  };
  // A still-vanilla external-tab body whose HTML carries a local island marker
  // (the real production pattern — these bodies emit data-* markers, never
  // data-campaign-action), so we can exercise the external-tab wrapper's
  // dispatchHtmlIslandAction onClick end to end.
  CJS.CampaignInventory = {
    render() {
      return '<section class="campaign-panel"><button class="island-act" data-full-rest="1">Rest party</button></section>';
    }
  };

  // 5. Mount the REAL shell.
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { CampaignShell } = loader.load(path.join(SRC, "CampaignShell.tsx"));
  const mount = document.getElementById("campaign-mount");
  const root = createRoot(mount);
  const renderShell = () => root.render(React.createElement(CampaignShell));
  // Nudge: re-render after the lazy chunk's import microtask resolves. React's
  // concurrent Suspense retry doesn't auto-flush under happy-dom (no real
  // scheduler), but a manual re-render picks up the now-resolved React.lazy.
  const nudge = async () => { await settle(); renderShell(); await settle(); };

  renderShell();
  await nudge();
  const mainEl = () => document.querySelector("main.campaign-main");
  const bodyResolved = (el) => !!el && !/campaign-loading/.test(el.innerHTML);
  ok("active tab BODY resolves (lazy chunk renders, not stuck on fallback)", bodyResolved(mainEl()),
     chromeState.getActiveTab && chromeState.getActiveTab());

  // ── Boot + chrome ──────────────────────────────────────────────────────────
  const shell = document.querySelector(".campaign-shell");
  ok("campaign shell mounts (boot did not throw / hang)", !!shell);
  ok("chrome: sub-tab strip renders", !!document.querySelector(".campaign-subtabs"));
  ok("chrome: command rail renders", !!document.querySelector(".campaign-rail"));
  ok("chrome: main body region renders", !!document.querySelector("main.campaign-main"));
  ok("no boot error surface", !document.querySelector(".campaign-error"));

  // ── Tab switch (sub-tab click → re-render → active marker moves) ─────────────
  const subtabs = Array.from(document.querySelectorAll(".campaign-subtabs button.campaign-tab"));
  ok("sub-tabs present to click", subtabs.length >= 2, `${subtabs.length} tabs`);
  const activeBefore = document.querySelector(".campaign-subtabs button.campaign-tab.active");
  const target = subtabs.find((b) => !b.classList.contains("active")) || subtabs[1];
  const tabBefore = chromeState.getActiveTab ? chromeState.getActiveTab() : null;
  if (target) {
    click(window, target);
    await nudge();
  }
  const tabAfter = chromeState.getActiveTab ? chromeState.getActiveTab() : null;
  ok("clicking a sub-tab changes the active tab", tabBefore !== tabAfter, `${tabBefore} -> ${tabAfter}`);
  ok("active sub-tab marker moved to the clicked tab",
     target && target.classList.contains("active") && target !== activeBefore);
  ok("the switched-to tab BODY renders (re-render + lazy resolve)", bodyResolved(mainEl()));

  // ── Drawer: command-rail panel button opens the PORTAL, close tears down ─────
  const railBtns = Array.from(document.querySelectorAll(".campaign-rail .campaign-rail-btn"))
    .filter((b) => !b.classList.contains("is-gm"));
  ok("command-rail panel button present", railBtns.length >= 1, `${railBtns.length} panel buttons`);
  if (railBtns[0]) {
    click(window, railBtns[0]);
    await settle();
  }
  const drawer = document.body.querySelector(".campaign-drawer");
  ok("opening a rail panel mounts the drawer portal under document.body", !!drawer);
  ok("shell flags drawer-open", !!document.querySelector(".campaign-shell.has-drawer-open"));
  ok("drawer portal is OUTSIDE the campaign-root subtree (createPortal)",
     !!drawer && !mount.contains(drawer));

  const closeBtn = drawer && drawer.querySelector(".campaign-drawer-close, [data-campaign-panel-close]");
  if (closeBtn) {
    click(window, closeBtn);
    await settle();
  }
  ok("close button tears the drawer down", !document.body.querySelector(".campaign-drawer"));

  // ── Typed action: GM rail button onClick → CampaignUI.handleAction ───────────
  const gmBtn = document.querySelector(".campaign-rail .campaign-rail-btn.is-gm");
  ok("GM rail button present (typed onClick)", !!gmBtn);
  const beforeGm = dispatched.length;
  if (gmBtn) {
    click(window, gmBtn);
    await settle();
  }
  ok("typed onClick routes to handleAction",
     dispatched.length > beforeGm && dispatched.some((d) => d.name === "gm-override"),
     dispatched.map((d) => d.name).join(","));

  // ── Island marker: data-* marker in a still-vanilla external-tab body ────────
  // Switch to the inventory tab (a still-vanilla HTML island) and click its
  // marker button — the external-tab wrapper's own onClick must translate it via
  // dispatchHtmlIslandAction → handleAction (there is no <main> forwarder now).
  chromeState.setActiveTab("inventory");
  CJS.CampaignUI.render();
  await nudge();
  const islandBtn = document.querySelector("main.campaign-main [data-full-rest]");
  ok("still-vanilla external-tab body rendered inside <main>", !!islandBtn);
  const beforeIsland = dispatched.length;
  if (islandBtn) {
    click(window, islandBtn);
    await settle();
  }
  ok("island data-* marker routes via the tab wrapper's dispatchHtmlIslandAction → handleAction",
     dispatched.length > beforeIsland && dispatched.some((d) => d.name === "full-rest"),
     dispatched.map((d) => d.name).join(","));

  // ── PWA: built artifact ships the PNG icons + a manifest ─────────────────────
  const dist = path.join(__dirname, "dist");
  if (fs.existsSync(dist)) {
    for (const f of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      ok(`dist ships ${f}`, fs.existsSync(path.join(dist, f)));
    }
    const manifest = ["manifest.webmanifest", "manifest.json"]
      .map((m) => path.join(dist, m)).find((p) => fs.existsSync(p));
    ok("dist ships a PWA manifest", !!manifest);
    if (manifest) {
      const txt = fs.readFileSync(manifest, "utf8");
      ok("manifest references the 192px PNG", txt.includes("icon-192.png"));
    }
  } else {
    console.log("  --  dist/ not present; skipping PWA artifact checks (run `npm run build`)");
  }

  try { root.unmount(); } catch { /* ignore */ }

  console.log("\nRESULTS: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  console.log("\nRESULTS: " + pass + " passed, " + (fail || 1) + " failed");
  process.exit(1);
});
