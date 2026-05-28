// Smoke test for the campaign UI tab boundary.
//
// Loads the tab registry + the three tab modules in isolation and asserts
// that the canonical tabs (roster, sideForge, oracleForge, worldMap,
// worldActivities) self-register. Also exercises the world-map adapter's
// defensive fallback to prove a tab can render end-to-end through the
// registry without a full CampaignState wiring.
//
// This is the guard rail for the campaign-ui.js -> tab modules split:
// if a tab file gets dropped from src/campaign/main.tsx (or its IIFE throws
// at load), _renderMain in the shell would silently fall back to its
// shrunken switch-case fallback and the wrong content would render for
// that tab. The smoke test catches that drift at the load boundary
// before it ships.
//
// Run: node test_campaign_ui_bootstrap.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
  window: { CJS: {} },
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, Object, Array, Number, JSON, Boolean, String,
  Map, Set, RegExp, Error, Promise, Symbol, Reflect,
  parseInt, parseFloat, isNaN, isFinite, Infinity, NaN
};
sandbox.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: {},
    setAttribute: () => {},
    appendChild: () => {},
    addEventListener: () => {}
  }),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { classList: { contains: () => false }, appendChild: () => {} }
};
sandbox.window.document = sandbox.document;
sandbox.window.addEventListener = () => {};

vm.createContext(sandbox);

// Phase H.4 — the leaf util helpers are migrating from `js/campaign/ui/*.js`
// to `src/campaign/util/*.ts` one file at a time. The TS modules install
// onto `window.CJS.CampaignUIInternal.<Namespace>` the same way the JS
// originals did, so vanilla consumers (campaign-ui.js + the still-JS
// helper files) don't need to change. This test loads only the remaining
// JS files; for ported namespaces it pre-seeds a minimal stub on the
// sandbox so the still-JS dependents (which look up Utils lazily inside
// function bodies) don't throw at load time. The full bootstrap test
// gets rewritten against the React tree in H.5.
sandbox.window.CJS.CampaignUIInternal = sandbox.window.CJS.CampaignUIInternal || {};
const id = (v) => v;
// Utils: ported to src/campaign/util/cui-utils.ts. The cui-*.js files
// that still live in js/campaign/ui/ call `_U().esc(v)` / `.label(v)` /
// `.escAttr(v)` lazily inside render functions; those aren't exercised
// by the registry-only smoke checks in this test, but the modules still
// reference these methods at module-load via captured aliases.
sandbox.window.CJS.CampaignUIInternal.Utils = {
  esc: (v) => String(v == null ? '' : v),
  escAttr: (v) => String(v == null ? '' : v),
  label: (v) => String(v == null ? '' : v),
  safe: (v) => String(v == null ? 'campaign' : v).toLowerCase(),
  truncate: (v) => String(v == null ? '' : v),
  currencyLabel: id,
  recordName: (_b, x) => x,
  lootLine: () => '',
  formatBundleText: () => ''
};
// Portraits: ported to src/campaign/util/cui-portraits.ts. Same lazy
// access pattern as Utils — the stub only needs to satisfy aliasing.
sandbox.window.CJS.CampaignUIInternal.Portraits = {
  icon: () => '',
  memberPortrait: () => '',
  memberPortraitFocus: () => null,
  focusAttrStyle: () => 'object-fit:cover'
};
// Log: ported to src/campaign/util/cui-log.ts.
sandbox.window.CJS.CampaignUIInternal.Log = {
  logKind: () => ({ key: 'system', label: 'Log' }),
  formatLogTime: () => '',
  logMeta: () => '',
  renderLogEntry: () => ''
};

// Load order mirrors src/campaign/main.tsx for the still-JS files only.
// Anything ported to TS is pre-seeded above; the rest still self-registers
// via IIFE on load.
const loadOrder = [
  'campaign/ui/cui-modals.js',
  'campaign/ui/cui-options.js',
  'campaign/ui/cui-controls.js',
  'campaign/ui/cui-equipment.js',
  'campaign/ui/tabs/cui-tabs-registry.js',
  'campaign/ui/tabs/cui-party-tab.js',
  'campaign/ui/tabs/cui-hub-tab.js',
  'campaign/ui/tabs/cui-world-map-tab.js',
  'campaign/ui/tabs/cui-react-bridge.js'
];

for (const file of loadOrder) {
  const code = fs.readFileSync(path.join(__dirname, 'js', file), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: file });
  } catch (e) {
    console.error('FAILED to load ' + file + ': ' + e.message);
    process.exit(1);
  }
}

let pass = 0;
let fail = 0;
function ok(label, cond, info) {
  if (cond) {
    pass += 1;
    console.log('  OK  ' + label + (info ? ' (' + info + ')' : ''));
  } else {
    fail += 1;
    console.log('  XX  ' + label + (info ? ' (' + info + ')' : ''));
  }
}

console.log('Campaign UI bootstrap smoke tests');

const CJS = sandbox.window.CJS;

// 1. Tab registry loaded with the expected API.
ok('CampaignUIInternal.Tabs is defined', !!CJS.CampaignUIInternal && !!CJS.CampaignUIInternal.Tabs);
const Tabs = CJS.CampaignUIInternal && CJS.CampaignUIInternal.Tabs;
ok('Tabs.register is a function', typeof Tabs?.register === 'function');
ok('Tabs.has is a function', typeof Tabs?.has === 'function');
ok('Tabs.get is a function', typeof Tabs?.get === 'function');
ok('Tabs.render is a function', typeof Tabs?.render === 'function');
ok('Tabs.ids is a function', typeof Tabs?.ids === 'function');

// 2. The canonical tabs self-registered on module load. If any of the
//    tab modules failed to import (e.g. dropped from src/campaign/main.tsx
//    after a refactor), at least one of these checks will fail.
// All previously-vanilla tabs the React bridge has taken over.
// cui-react-bridge.js loads AFTER each per-domain tab module so its
// re-registration wins on Map.set.
const REACT_TABS = [
  'settings', 'logs', 'roster',
  'worldMap', 'worldActivities',
  'sideForge', 'questChains', 'oracleForge', 'battleSets', 'mapSeeds',
  'inventory', 'shops', 'craft', 'cook', 'farm', 'relationships',
  // closure-private vanilla renderers exposed via
  // CampaignUI.renderTabBody and re-registered through the bridge.
  'worldGate', 'storyHome', 'storySummary', 'storyDirector',
  'questHome', 'quests',
  'eventHome', 'eventCharacter', 'eventSpecial', 'eventSide', 'eventLog',
  'scenarios', 'maps', 'minigameTest', 'overview'
];
for (const id of REACT_TABS) {
  ok('React tab "' + id + '" is registered', Tabs.has(id));
  const html = Tabs.render(id, { currentWorld: 'haven' }, {});
  ok('React tab "' + id + '" returns a mount placeholder',
     typeof html === 'string'
     && html.indexOf('data-react-tab="' + id + '"') >= 0
     && html.indexOf('id="campaign-react-tab-' + id + '"') >= 0);
}

// 3. The tab modules also expose their public namespaces so the shell's
//    closure delegators (HubTab.renderSideCard, PartyTab.openSkillPoolPicker,
//    WorldMapTab.renderTravelMap) can keep calling into them by reference.
//    The React tabs (CampaignRosterTab, CampaignWorldMapTab) also reach
//    into these namespaces for the inner-card / inner-panel HTML.
ok('PartyTab namespace exposed', !!CJS.CampaignUIInternal.PartyTab);
ok('HubTab namespace exposed', !!CJS.CampaignUIInternal.HubTab);
ok('WorldMapTab namespace exposed', !!CJS.CampaignUIInternal.WorldMapTab);

// 4. The registry call should be a no-op when the id is unknown — the
//    shell relies on this to fall through to its switch-case fallback
//    for tabs that have not been migrated yet (storyHome, eventLog, etc.).
const minimalState = { currentWorld: 'haven' };
ok('Tabs.has returns false for an unknown tab id', !Tabs.has('definitelyNotARealTab'));
ok('Tabs.render returns null for an unknown tab id',
   Tabs.render('definitelyNotARealTab', minimalState, {}) === null);

// 5. React-shell bridge surface lives on CampaignUI. The bootstrap
//    sandbox here doesn't execute campaign-ui.js, but the bridge is
//    documented in `src/campaign/CampaignShell.tsx` and exercised
//    end-to-end in `test_campaign_shell_bridge.js`. This block only
//    sanity-checks that the cui-react-bridge file is the last loaded
//    so the React wrapper wins for the registered ids.
const bridgeFile = 'campaign/ui/tabs/cui-react-bridge.js';
ok('cui-react-bridge is last in load order',
   loadOrder[loadOrder.length - 1] === bridgeFile,
   loadOrder[loadOrder.length - 1]);

console.log('\nRESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
