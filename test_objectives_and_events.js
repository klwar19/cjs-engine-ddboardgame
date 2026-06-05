// test_objectives_and_events.js — Regression tests for the new pluggable
// combat objectives (escort / capture / survival / assassination), world
// events (drop multiplier / shop discount / farm growth), fishing minigame
// helpers, and content validator.
//
// Run: node test_objectives_and_events.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadEngineSource } = require('./tools/test/engine-source.cjs');

const sandbox = {
  window: { CJS: {} },
  document: {
    addEventListener: () => {},
    createElement: () => ({
      className: '', innerHTML: '', appendChild: () => {}, removeChild: () => {},
      querySelector: () => null, querySelectorAll: () => [], remove: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dataset: {}
    }),
    removeEventListener: () => {},
    body: { appendChild: () => {}, removeChild: () => {} },
    getElementById: () => null,
    readyState: 'complete'
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: clearTimeout,
  performance: { now: () => Date.now() },
  Math, Object, Array, String, Number, Boolean, JSON, Map, Set,
  Date, RegExp, Error, Promise, Symbol, Proxy, Reflect,
  parseInt, parseFloat, isNaN, isFinite, undefined,
  Infinity, NaN
};
vm.createContext(sandbox);

const loadOrder = [
  'core/constants.js',
  'core/formulas.js',
  'core/dice.js',
  'core/undo-manager.js',
  'core/state-tools.js',
  'core/data-store.js',
  'core/content-manager.js',
  'core/skill-resolver.js',
  'services/persona-service.js',
  'services/content-validator.js',
  'combat/combat-objectives.js',
  'campaign/relationship-tiers.js',
  'campaign/campaign-tags.js',
  'campaign/campaign-state.js',
  'campaign/campaign-conditions.js',
  'campaign/campaign-quest-pulse.js',
  'campaign/campaign-alignment.js',
  'campaign/campaign-ops.js',
  'campaign/campaign-world-events.js'
];

for (const file of loadOrder) {
  try {
    const code = loadEngineSource(file);
    vm.runInContext(code, sandbox);
  } catch (e) {
    console.error(`LOAD ERROR: ${file}:`, e.message);
    process.exit(1);
  }
}

const CJS = sandbox.window.CJS;
const OBJ = CJS.CombatObjectives;
const WE  = CJS.CampaignWorldEvents;
const DS  = CJS.DataStore;
const CV  = CJS.ContentValidator;

let _passed = 0, _failed = 0;
function assert(label, condition) {
  if (condition) { _passed++; console.log(`  ✅ ${label}`); }
  else { _failed++; console.log(`  ❌ ${label}`); }
}
function assertEq(label, actual, expected) {
  if (actual === expected) { _passed++; console.log(`  ✅ ${label} (${JSON.stringify(actual)})`); }
  else { _failed++; console.log(`  ❌ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ─────────────────────────────────────────────────────────────────────
console.log('Combat Objectives regression tests');

// ── 1. Default (no objective) returns null ─────────────────────────
{
  const tracker = OBJ.build({ id: 'enc1', units: [] });
  assert('no objective → null tracker (kill-all back-compat)', tracker === null);
}
{
  const tracker = OBJ.build({ id: 'enc1', objective: { kind: 'kill_all' } });
  assert('explicit kill_all → also null (back-compat)', tracker === null);
}

// ── 2. Escort: VIP death = loss ────────────────────────────────────
{
  const tracker = OBJ.build({ objective: { kind: 'escort', vipId: 'vip_npc', protectRounds: 3 } });
  assert('escort tracker built', tracker && tracker.kind === 'escort');
  const state = {
    roundNumber: 1,
    units: {
      'vip_npc': { instanceId: 'vip_npc', team: 'player', currentHP: 0, maxHP: 30, pos: [1, 1] },
      'hero':    { instanceId: 'hero',    team: 'player', currentHP: 10, maxHP: 20, pos: [2, 2] },
      'wolf':    { instanceId: 'wolf',    team: 'enemy',  currentHP: 5,  maxHP: 5,  pos: [3, 3] }
    }
  };
  const verdict = OBJ.evaluate(tracker, state);
  assertEq('escort: VIP dead → enemy wins', verdict?.winner, 'enemy');
  assertEq('escort: reason set', verdict?.reason, 'escort_vip_lost');
}

// ── 3. Escort survives N rounds → win ──────────────────────────────
{
  const tracker = OBJ.build({ objective: { kind: 'escort', vipId: 'vip', protectRounds: 2 } });
  const state = {
    roundNumber: 3,  // 3 rounds elapsed
    units: {
      'vip':  { instanceId: 'vip',  team: 'player', currentHP: 30, maxHP: 30, pos: [1, 1] },
      'wolf': { instanceId: 'wolf', team: 'enemy',  currentHP: 5,  maxHP: 5,  pos: [3, 3] }
    }
  };
  const verdict = OBJ.evaluate(tracker, state);
  assertEq('escort: survived enough rounds → player wins', verdict?.winner, 'player');
}

// ── 4. Capture point: hold for N rounds → win ──────────────────────
{
  const tracker = OBJ.build({ objective: { kind: 'capture_point', captureCells: [[2, 2]], holdRounds: 2 } });
  const state = {
    roundNumber: 1,
    units: {
      'hero': { instanceId: 'hero', team: 'player', currentHP: 20, maxHP: 20, pos: [2, 2] },
      'wolf': { instanceId: 'wolf', team: 'enemy',  currentHP: 5,  maxHP: 5,  pos: [6, 6] }
    }
  };
  let verdict = OBJ.evaluate(tracker, state);
  assert('capture: round 1 (in zone) → not yet won', verdict === null);
  assertEq('capture progress after r1', tracker.captureProgress, 1);
  verdict = OBJ.evaluate(tracker, state);
  assertEq('capture: round 2 (still in zone) → player wins', verdict?.winner, 'player');
  assertEq('reason', verdict?.reason, 'point_captured');
}

// ── 5. Capture point: enemy contests → progress resets ────────────
{
  const tracker = OBJ.build({ objective: { kind: 'capture_point', captureCells: [[2, 2]], holdRounds: 3 } });
  const state = {
    roundNumber: 1,
    units: {
      'hero': { instanceId: 'hero', team: 'player', currentHP: 20, maxHP: 20, pos: [2, 2] },
      'wolf': { instanceId: 'wolf', team: 'enemy',  currentHP: 5,  maxHP: 5,  pos: [2, 2] }
    }
  };
  OBJ.evaluate(tracker, state);
  assertEq('capture: enemy on zone → progress 0', tracker.captureProgress, 0);
  assert('capture: marked contested', tracker.captureBroken);
}

// ── 6. Survival: round threshold → win ────────────────────────────
{
  const tracker = OBJ.build({ objective: { kind: 'survival', surviveRounds: 4 } });
  let state = { roundNumber: 2, units: { 'h': { instanceId: 'h', team: 'player', currentHP: 1, maxHP: 1 }, 'e': { instanceId: 'e', team: 'enemy', currentHP: 5, maxHP: 5 } } };
  assert('survival r2 → still going', OBJ.evaluate(tracker, state) === null);
  state.roundNumber = 5;
  const v = OBJ.evaluate(tracker, state);
  assertEq('survival r5 → player wins', v?.winner, 'player');
}

// ── 7. Assassination: target alive → not done; killed + no escape → win ──
{
  const tracker = OBJ.build({ objective: { kind: 'assassination', targetId: 'boss' } });
  const state = {
    roundNumber: 1,
    units: {
      'hero': { instanceId: 'hero', team: 'player', currentHP: 10, maxHP: 10 },
      'boss': { instanceId: 'boss', team: 'enemy',  currentHP: 50, maxHP: 50 }
    }
  };
  assert('assassinate: target alive → not won', OBJ.evaluate(tracker, state) === null);
  state.units.boss.currentHP = 0;
  const v = OBJ.evaluate(tracker, state);
  assertEq('assassinate: target dead, no escape needed → player wins', v?.winner, 'player');
}

// ── 8. Assassination: kill + escape required ──────────────────────
{
  const tracker = OBJ.build({ objective: { kind: 'assassination', targetId: 'boss', escapeCells: [[0, 0]] } });
  const state = {
    roundNumber: 1,
    units: {
      'hero': { instanceId: 'hero', team: 'player', currentHP: 10, maxHP: 10, pos: [5, 5] },
      'boss': { instanceId: 'boss', team: 'enemy',  currentHP: 0,  maxHP: 50 }
    }
  };
  assert('assassinate+escape: not at escape → keep playing', OBJ.evaluate(tracker, state) === null);
  state.units.hero.pos = [0, 0];
  const v = OBJ.evaluate(tracker, state);
  assertEq('assassinate+escape: at escape → win', v?.winner, 'player');
}

// ── 9. Describe outputs sensible labels ───────────────────────────
{
  const tracker = OBJ.build({ objective: { kind: 'escort', vipId: 'vip_npc' } });
  const state = { roundNumber: 1, units: { 'vip_npc': { name: 'Princess', currentHP: 10, maxHP: 20, instanceId: 'vip_npc' } } };
  const d = OBJ.describe(tracker, state);
  assert('describe escort returns a title', !!d.title);
  assert('describe escort tracks VIP HP %', d.vipHpPct === 50);
}

// ── 10. Highlight cells ──────────────────────────────────────────
{
  const tracker = OBJ.build({ objective: { kind: 'capture_point', captureCells: [[1, 1], [2, 2]] } });
  const cells = OBJ.getHighlightCells(tracker);
  assertEq('capture: 2 highlight cells', cells.length, 2);
}

// ─────────────────────────────────────────────────────────────────────
console.log('\nWorld Events regression tests');

// Seed a minimal campaign state for testing world events.
// Build initial save mocking the data needed by CampaignState.
DS.create('campaigns', {
  id: 'test_campaign',
  world: 'haven',
  startPhase: 'town_phase',
  start: { party: [], currencies: { gold: 100 }, items: {}, materials: {}, food: {}, questItems: {} },
  phaseRules: [
    { id: 'town_phase', name: 'Town', farmGrowth: 1, eventCharges: {} },
    { id: 'field_phase', name: 'Field', farmGrowth: 0 }
  ]
});
DS.create('pocketHavenRules', { id: 'phr_default', farm: { startingPlots: 1, defaultGrowthTicks: 3 }, stations: [] });

// Load fish_catalog & world_events directly so the runtime can read them.
const fishCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/system/fish_catalog.json'), 'utf8'));
for (const fish of fishCatalog.entries) {
  DS.create('fishCatalog', fish);
}
const eventsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/system/world_events.json'), 'utf8'));
for (const def of eventsData.entries) {
  DS.create('worldEvents', def);
}

const CS = CJS.CampaignState;
const Ops = CJS.CampaignOps;
CS.loadContentFromDataStore();
CS.createNewSave('test_campaign', { saveId: 'test_world_events' });

// ── 11. Catalog populated ───────────────────────────────────────
{
  const cat = WE.getCatalog();
  assert('catalog has world events', cat.length >= 6);
}

// ── 12. Start an event ───────────────────────────────────────────
{
  const started = WE.start('wev_double_materials');
  assert('event started', started?.id === 'wev_double_materials');
  const active = WE.getActive();
  assert('active list contains event', active.some((ev) => ev.id === 'wev_double_materials'));
  // Material drop multiplier should be 2 now.
  assertEq('drop multiplier for materials → 2.0', WE.getDropMultiplier('materials'), 2.0);
  assertEq('drop multiplier for items unchanged → 1.0', WE.getDropMultiplier('items'), 1.0);
}

// ── 13. Material drops boosted by give_material ─────────────────
{
  // Material isn't in DataStore, just an arbitrary id.
  Ops.apply({ op: 'give_material', id: 'mat_iron', qty: 5 });
  const state = CS.getState();
  // Boosted from 5 → 10
  assertEq('material qty doubled by active event', state.inventory.materials.mat_iron, 10);
}

// ── 14. Bazaar Sale → shop discount ───────────────────────────────
{
  WE.start('wev_bazaar_sale');
  const discount = WE.getShopDiscount();
  assert('shop discount > 0', discount > 0);
  assert('shop discount <= 0.9', discount <= 0.9);
  // Buy something at price 100 — should be 50.
  CS.mutate((s) => { s.currencies.haven_gold = 1000; }, { source: 'test' });
  // Add a fake item id; the buy path uses op.id directly.
  Ops.apply({ op: 'shop_buy', id: 'fake_item', price: 100, qty: 1, type: 'item' });
  const gold = CS.getState().currencies.haven_gold;
  assert(`gold decreased by ~50 (post-sale), got ${gold}`, gold <= 951 && gold >= 949);
}

// ── 15. End an event ────────────────────────────────────────────
{
  const ended = WE.end('wev_double_materials');
  assert('event ended', !!ended);
  assertEq('after end, materials drop multiplier → 1.0', WE.getDropMultiplier('materials'), 1.0);
  const active = WE.getActive();
  assert('active list no longer contains it', !active.some((ev) => ev.id === 'wev_double_materials'));
  const history = WE.getHistory();
  assert('history has the ended event', history.some((h) => h.id === 'wev_double_materials'));
}

// ── 16. Phase pass ticks remaining + spawns ─────────────────────
{
  // Force-start a fresh event with a fixed duration of 1 so we can verify expiry.
  WE.start('wev_zombie_horde', { durationPhases: 1 });
  let active = WE.getActive();
  const beforeCount = active.length;
  assert('zombie horde active', active.some((ev) => ev.id === 'wev_zombie_horde'));
  // Simulate phase pass via passPhase op.
  Ops.apply({ op: 'pass_phase' });
  active = WE.getActive();
  assert('zombie horde expired after one phase tick', !active.some((ev) => ev.id === 'wev_zombie_horde'));
}

// ─────────────────────────────────────────────────────────────────────
console.log('\nContent Validator regression tests');

// ── 17. Validator runs and stats are non-empty ──────────────────
{
  const report = CV.run();
  assert('validator returns a report', !!report && Array.isArray(report.errors));
  assert('validator counted world events', report.stats.byCategory.worldEvents >= 6);
  assert('validator counted fish catalog', report.stats.byCategory.fishCatalog >= 6);
}

// ── 18. Validator catches broken escort objective ───────────────
{
  DS.create('encounters', {
    id: 'enc_broken_escort',
    width: 8,
    height: 8,
    units: [],
    objective: { kind: 'escort' /* missing vipId */ }
  });
  const report = CV.run();
  const err = report.errors.find((e) => e.id === 'enc_broken_escort');
  assert('validator flags broken escort objective', !!err);
}

// ── 19. Validator catches unknown QTE on a skill ───────────────
{
  DS.create('skills', { id: 'skl_broken_qte', name: 'Bad', qte: 'not-real', cost: 1, ap: 1 });
  const report = CV.run();
  const err = report.errors.find((e) => e.id === 'skl_broken_qte');
  assert('validator flags unknown QTE type', !!err);
}

// ─────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`RESULTS: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
}
