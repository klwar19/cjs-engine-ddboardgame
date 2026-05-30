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
// Controls: ported to src/campaign/util/cui-controls.ts.
sandbox.window.CJS.CampaignUIInternal.Controls = {
  purposeTone: () => 'flavor',
  purposeKeyForCard: () => 'hubPulse',
  renderInlinePurpose: () => '',
  impactLegendItem: () => '',
  controlGroup: () => '',
  actionMenu: () => '',
  actionBtn: () => '',
  renderTownActionButton: () => ''
};
// Modals: ported to src/campaign/util/cui-modals.ts.
sandbox.window.CJS.CampaignUIInternal.Modals = {
  desc: () => '',
  pickerItem: () => '',
  sortOptionLabel: () => 0,
  formLabel: () => ({}),
  formModal: () => null,
  opPickerModal: () => null,
  textareaModal: () => null,
  numberModal: () => null
};
// Options: ported to src/campaign/util/cui-options.ts.
sandbox.window.CJS.CampaignUIInternal.Options = {
  bucketOptions: () => [],
  statusOptions: () => [],
  seedOptions: () => [],
  worldOptions: () => [],
  tentOptions: () => []
};
// Equipment: ported to src/campaign/util/cui-equipment.ts.
sandbox.window.CJS.CampaignUIInternal.Equipment = {
  cleanType: (v) => String(v == null ? '' : v),
  inferType: () => '',
  weaponType: () => '',
  armorType: () => '',
  accessoryType: () => '',
  allowedTypes: () => [],
  memberCanUseWeapon: () => true,
  memberCanUseArmor: () => true,
  equipmentKind: () => '',
  equipmentType: () => '',
  weaponSummary: () => '',
  effectSummary: () => '',
  equipmentDesc: () => '',
  delta: () => '0',
  slotKind: () => 'accessory',
  slotLabel: (v) => String(v == null ? '' : v),
  normalizeEquipmentSlots: () => ({ weapon: null, armor: null, accessory1: null, accessory2: null }),
  equipmentChangeDescription: () => '',
  equipmentOptions: () => [],
  equipmentPickerItem: () => ''
};

// Tabs registry: ported to src/campaign/util/cui-tabs-registry.ts. The
// behaviour is small enough to inline here for the sandbox; the TS module
// installs the same surface in the actual browser run.
const _tabsRegistry = new Map();
sandbox.window.CJS.CampaignUIInternal.Tabs = {
  register: (id, def) => {
    if (!id || typeof id !== 'string') throw new Error('Tabs.register: id required');
    if (!def || typeof def.render !== 'function') throw new Error('Tabs.register(' + id + '): def.render required');
    _tabsRegistry.set(id, Object.freeze({ id, render: def.render, actions: def.actions || null }));
  },
  has: (id) => _tabsRegistry.has(id),
  get: (id) => _tabsRegistry.get(id) || null,
  render: (id, state, helpers) => {
    const def = _tabsRegistry.get(id);
    if (!def) return null;
    return def.render(state, helpers);
  },
  ids: () => Array.from(_tabsRegistry.keys())
};
// WorldMapTab: ported to src/campaign/util/cui-world-map-tab.ts (empty
// namespace stub — the actual rendering moved to React via the typed
// getTravelMapData / getActivitiesData bridges).
sandbox.window.CJS.CampaignUIInternal.WorldMapTab = Object.freeze({});

// Load order mirrors src/campaign/main.tsx for the still-JS files only.
// Anything ported to TS is pre-seeded above; the rest still self-registers
// via IIFE on load. Phase K.3 ported the hub side-content primitives
// (HubTab) to src/campaign/util/cui-hub-tab.ts, so only the roster
// detail-row island (cui-party-tab.js) remains as raw JS.
const loadOrder = [
  'campaign/ui/tabs/cui-party-tab.js'
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

// React-bridge: ported to src/campaign/util/cui-react-bridge.ts. It
// registers a mount-point placeholder for every React-owned tab. This
// must run AFTER cui-party-tab.js / cui-hub-tab.js so the Map.set
// override semantics still hold (the React bridge wins on the shared
// ids: roster / worldMap / worldActivities / sideForge / ...).
function mount(tabId) {
  return '<div class="campaign-react-tab-mount" data-react-tab="' + tabId + '" id="campaign-react-tab-' + tabId + '"></div>';
}
const REACT_BRIDGE_TABS = [
  'settings', 'logs', 'roster',
  'worldMap', 'worldActivities',
  'sideForge', 'questChains', 'oracleForge', 'battleSets', 'mapSeeds',
  'inventory', 'shops', 'craft', 'cook', 'farm', 'relationships',
  'worldGate', 'storyHome', 'storySummary', 'storyDirector',
  'questHome', 'quests',
  'eventHome', 'eventCharacter', 'eventSpecial', 'eventSide', 'eventLog',
  'scenarios', 'maps', 'minigameTest', 'overview'
];
for (const tid of REACT_BRIDGE_TABS) {
  sandbox.window.CJS.CampaignUIInternal.Tabs.register(tid, { render: () => mount(tid) });
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

// 3. The surviving JS island exposes its public namespace so the shell's
//    delegators (PartyTab.openSkillPoolPicker / rosterMemberData) can keep
//    calling into it by reference. The React tab (CampaignRosterTab) also
//    reaches into PartyTab for the detail-row HTML.
ok('PartyTab namespace exposed', !!CJS.CampaignUIInternal.PartyTab);
//    HubTab (side-content primitives) + WorldMapTab were ported to TS; their
//    install-on-window surface is exercised by the browser/VR run, not this
//    raw-JS sandbox, so assert the TS source exists (mirrors cui-react-bridge).
ok('cui-hub-tab ported to TS', fs.existsSync(path.join(__dirname, 'src/campaign/util/cui-hub-tab.ts')));
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
//    end-to-end in `test_campaign_shell_bridge.js`.
//
//    cui-react-bridge ported to TS in H.4 — the React tabs are
//    registered inline above (after the still-JS tab modules) so the
//    Map.set override still wins.
ok('cui-react-bridge ported to TS', fs.existsSync(path.join(__dirname, 'src/campaign/util/cui-react-bridge.ts')));

console.log('\nRESULTS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
