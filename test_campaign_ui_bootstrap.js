// Smoke test for the campaign UI tab boundary.
//
// Loads the tab registry + the three tab modules in isolation and asserts
// that the canonical tabs (roster, sideForge, oracleForge, worldMap,
// worldActivities) self-register. Also exercises the world-map adapter's
// defensive fallback to prove a tab can render end-to-end through the
// registry without a full CampaignState wiring.
//
// This is the guard rail for the campaign-ui.js -> tab modules split:
// if a tab file gets dropped from entry-campaign.js (or its IIFE throws
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

// Load order mirrors the entry-campaign.js chain: leaf helpers first,
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
  'campaign/ui/tabs/cui-world-map-tab.js'
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
//    tab modules failed to import (e.g. dropped from entry-campaign.js
//    after a refactor), at least one of these checks will fail.
const REQUIRED_TABS = ['roster', 'sideForge', 'oracleForge', 'worldMap', 'worldActivities'];
for (const id of REQUIRED_TABS) {
  ok('tab "' + id + '" is registered', Tabs.has(id));
  const def = Tabs.get(id);
  ok('tab "' + id + '" has a render function', typeof def?.render === 'function');
}

// 3. The tab modules also expose their public namespaces so the shell's
//    closure delegators (HubTab.renderSideCard, PartyTab.openSkillPoolPicker,
//    WorldMapTab.renderTravelMap) can keep calling into them by reference.
ok('PartyTab namespace exposed', !!CJS.CampaignUIInternal.PartyTab);
ok('HubTab namespace exposed', !!CJS.CampaignUIInternal.HubTab);
ok('WorldMapTab namespace exposed', !!CJS.CampaignUIInternal.WorldMapTab);

// 4. End-to-end render through the registry. The world-map tab adapter
//    is the thinnest registered renderer: when CampaignWorldMap is not
//    loaded it returns a defensive "module not loaded" panel string. This
//    stands in for the "campaign shell renders without errors" check —
//    it proves Tabs.render(id, state, helpers) reaches a real renderer
//    end-to-end without a full CampaignState wiring.
const minimalState = { currentWorld: 'haven' };

let worldMapHtml = null;
let worldMapThrew = null;
try { worldMapHtml = Tabs.render('worldMap', minimalState, {}); }
catch (e) { worldMapThrew = e; }
ok('worldMap render returns a string without throwing',
   !worldMapThrew && typeof worldMapHtml === 'string' && worldMapHtml.length > 0,
   worldMapThrew ? worldMapThrew.message : 'len=' + (worldMapHtml ? worldMapHtml.length : 0));
ok('worldMap fallback contains the defensive panel marker',
   typeof worldMapHtml === 'string' && worldMapHtml.indexOf('World map UI not loaded') >= 0);

let activitiesHtml = null;
let activitiesThrew = null;
try { activitiesHtml = Tabs.render('worldActivities', minimalState, {}); }
catch (e) { activitiesThrew = e; }
ok('worldActivities render returns a string without throwing',
   !activitiesThrew && typeof activitiesHtml === 'string' && activitiesHtml.length > 0,
   activitiesThrew ? activitiesThrew.message : 'len=' + (activitiesHtml ? activitiesHtml.length : 0));
ok('worldActivities fallback contains the defensive panel marker',
   typeof activitiesHtml === 'string' && activitiesHtml.indexOf('World activities UI not loaded') >= 0);

// 5. The registry call should be a no-op when the id is unknown — the
//    shell relies on this to fall through to its switch-case fallback
//    for tabs that have not been migrated yet (storyHome, eventLog, etc.).
ok('Tabs.has returns false for an unknown tab id', !Tabs.has('definitelyNotARealTab'));
ok('Tabs.render returns null for an unknown tab id',
   Tabs.render('definitelyNotARealTab', minimalState, {}) === null);

console.log('\nRESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
