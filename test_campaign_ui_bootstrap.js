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

// Load order mirrors the src/campaign/main.tsx chain: leaf helpers first,
// then the tab registry, then the tab modules that self-register against
// it. Each tab IIFE calls Tabs.register(...) at the bottom, so simply
// loading the file is enough to populate the registry.
const loadOrder = [
  'campaign/ui/cui-utils.js',
  'campaign/ui/cui-portraits.js',
  'campaign/ui/cui-modals.js',
  'campaign/ui/cui-options.js',
  'campaign/ui/cui-controls.js',
  'campaign/ui/cui-equipment.js',
  'campaign/ui/cui-log.js',
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
  'inventory', 'shops', 'craft', 'cook', 'farm', 'relationships'
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

console.log('\nRESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
