// test_phase_expansion.js
// Regression tests for the 2026-05 phase expansion: progression curves,
// procedural enemy modifiers, Pocket Haven facilities, consequence
// tracking, combo system shape, and cooking minigame load.
//
// Run via: node test_phase_expansion.js

const fs = require('fs');
const path = require('path');

global.window = { CJS: {} };

// Minimal DOM stubs so UI-touching modules don't blow up on load.
const stubEl = () => ({
  style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  appendChild() {}, removeChild() {}, setAttribute() {}, removeAttribute() {},
  addEventListener() {}, removeEventListener() {},
  querySelector() { return stubEl(); },
  querySelectorAll() { return []; },
  innerHTML: '', textContent: '', tabIndex: 0, dataset: {}, focus() {}
});
global.document = {
  body: stubEl(),
  createElement: () => stubEl(),
  documentElement: stubEl(),
  addEventListener() {}, removeEventListener() {}
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

function loadScript(rel) {
  const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
  // eslint-disable-next-line no-eval
  eval.call(global, src);
}

const modules = [
  'js/core/constants.js',
  'js/core/dice.js',
  'js/core/formulas.js',
  'js/core/data-store.js',
  'js/combat/enemy-modifiers.js',
  'js/combat/action-handler.js',
  'js/campaign/campaign-alignment.js',
  'js/campaign/pocket-haven-facilities.js'
];
for (const m of modules) {
  try { loadScript(m); } catch (e) {
    console.error('Load failed:', m, e.message);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      { fail++; console.log('  ❌ ' + name); }
}

console.log('\n── TEST: Progression curve rebalance ──');
const PROG = window.CJS.CONST.PROGRESSION;
ok('skill AP threshold for L2 ≤ 6 (smoother early)', PROG.skillApThresholds[1] <= 6);
ok('char XP threshold for L2 ≤ 35', PROG.charXpThresholds[1] <= 35);
ok('apGainQteMultipliers.perfect ≥ 1.5', PROG.apGainQteMultipliers.perfect >= 1.5);
ok('apGainQteMultipliers.fail ≥ 0.6 (less punishing)', PROG.apGainQteMultipliers.fail >= 0.6);

console.log('\n── TEST: Procedural enemy modifiers ──');
const EM = window.CJS.EnemyModifiers;
ok('module loaded', !!EM);
ok('catalog has 6 prefixes', EM.listModifiers().length === 6);
const wolf = { id: 'wolf', stats: { S: 5, E: 5, A: 5 }, type: 'beast', team: 'enemy', innatePassives: [] };
ok('shouldModify allows normal monsters', EM.shouldModify(wolf));
ok('shouldModify skips bosses', !EM.shouldModify({ ...wolf, isBoss: true }));
ok('shouldModify skips authored uniques', !EM.shouldModify({ ...wolf, isUnique: true }));
const frozen = EM.applyModifier(wolf, 'frozen');
ok('applyModifier sets _procModifier', frozen._procModifier === 'frozen');
ok('applyModifier renames unit', !!frozen.name && frozen.name.includes('Frozen'));
ok('applyModifier adds Ice resist', frozen.resist.includes('Ice'));
ok('applyModifier adds Fire weakness', frozen.weak.includes('Fire'));
ok('applyModifier adds passive ref', frozen.innatePassives.includes('enemy_mod_frozen_aura'));

console.log('\n── TEST: Pocket Haven facilities ──');
const PHF = window.CJS.PocketHavenFacilities;
ok('module loaded', !!PHF);
const catalog = PHF.listFacilities();
ok('training_ground in catalog', catalog.some((f) => f.id === 'training_ground'));
ok('advanced_craft in catalog', catalog.some((f) => f.id === 'advanced_craft'));
ok('ranch in catalog', catalog.some((f) => f.id === 'ranch'));
const fakeState = {
  currencies: { gold: 1000, jp: 100 },
  inventory: { materials: { haven_iron_ingot: 10, haven_sprite_dust: 10, haven_wolf_pelt: 10 } },
  pocketHaven: { enabled: true, facilities: {} },
  party: { test_member: { name: 'Test', skillProgress: {} } }
};
const buildResult = PHF.build(fakeState, { facilityId: 'training_ground' });
ok('training_ground build succeeds with funds', buildResult.ok);
ok('build records instance', !!fakeState.pocketHaven.facilities.training_ground);
ok('build consumes gold', fakeState.currencies.gold < 1000);
ok('training_ground gets usesRemaining', fakeState.pocketHaven.facilities.training_ground.usesRemaining > 0);
const dupBuild = PHF.build(fakeState, { facilityId: 'training_ground' });
ok('cannot double-build', !dupBuild.ok && dupBuild.reason === 'already_built');
const noFundsState = { currencies: {}, inventory: {}, pocketHaven: { facilities: {} } };
const failBuild = PHF.build(noFundsState, { facilityId: 'training_ground' });
ok('cannot afford = denial', !failBuild.ok && failBuild.reason === 'cannot_afford');
const trainResult = PHF.trainSkill(fakeState, { memberId: 'test_member', skillId: 'test_skill' });
ok('trainSkill succeeds with uses left', trainResult.ok);
ok('trainSkill grants ≥1 AP', (trainResult.apGranted || 0) > 0);
ok('trainSkill decrements usesRemaining', fakeState.pocketHaven.facilities.training_ground.usesRemaining < 2);
PHF.refreshDailyUses(fakeState);
ok('refreshDailyUses restores uses', fakeState.pocketHaven.facilities.training_ground.usesRemaining >= 2);

console.log('\n── TEST: Consequence tracking ──');
const Align = window.CJS.CampaignAlignment;
ok('recordConsequenceHook exists', typeof Align.recordConsequenceHook === 'function');
ok('dueConsequenceHooks exists', typeof Align.dueConsequenceHooks === 'function');
ok('markHookFired exists', typeof Align.markHookFired === 'function');
const consState = {
  currentChapter: 1, currentWorld: 'haven',
  phase: { number: 1, type: 'town' },
  flags: {}, storyMode: { partResults: {} }
};
Align.normalizeState(consState);
const hook = Align.recordConsequenceHook(consState, {
  choiceId: 'spare_bandit', label: 'Spared the bandit',
  fireWhen: { chapterMin: 2 }, fireOps: [{ op: 'log', text: 'returns' }]
});
ok('hook created with id', !!hook?.id);
ok('hook stored on ledger', consState.choiceConsequences.futureHooks.length >= 1);
ok('not due at chapter 1', Align.dueConsequenceHooks(consState).length === 0);
consState.currentChapter = 2;
const due = Align.dueConsequenceHooks(consState);
ok('IS due at chapter 2', due.length === 1);
ok('due hook is the one we created', due[0].id === hook.id);
Align.markHookFired(consState, hook.id);
ok('after firing, not due again', Align.dueConsequenceHooks(consState).length === 0);

// Flag-gated consequence
const flagHook = Align.recordConsequenceHook(consState, {
  choiceId: 'told_truth', label: 'Told the truth',
  fireWhen: { flag: 'town_visited' }, fireOps: []
});
ok('flag hook created', !!flagHook?.id);
ok('not due without flag', !Align.dueConsequenceHooks(consState).some((h) => h.id === flagHook.id));
consState.flags.town_visited = true;
ok('due once flag set', Align.dueConsequenceHooks(consState).some((h) => h.id === flagHook.id));

console.log('\n── TEST: Combo system lifecycle ──');
const AH = window.CJS.ActionHandler;
ok('action handler loaded', !!AH);
let lastQteMultiplier = 0;
const comboActor = {
  instanceId: 'combo_actor',
  name: 'Combo Actor',
  team: 'player',
  currentHP: 30,
  currentMP: 20,
  pos: [0, 0],
  stats: { S: 8, P: 8, A: 8, L: 8 },
  compiledStats: { S: 8, P: 8, A: 8, L: 8 },
  skills: ['test_combo_strike'],
  turnState: { apRemaining: 3, mainActionUsed: false, cooldowns: {} },
  equipment: []
};
const comboTarget = {
  instanceId: 'combo_target',
  name: 'Target',
  team: 'enemy',
  currentHP: 50,
  currentMP: 0,
  maxHP: 50,
  pos: [0, 1],
  stats: { A: 1 },
  compiledStats: { A: 1 }
};
const comboUnits = { combo_actor: comboActor, combo_target: comboTarget };
window.CJS.DataStore.create('skills', {
  id: 'test_combo_strike',
  name: 'Combo Strike',
  qte: 'quickpress',
  power: 10,
  ap: 1,
  mp: 0,
  range: 1,
  damageType: 'Physical',
  element: 'Physical'
});
window.CJS.GridEngine = {
  getUnit: (id) => comboUnits[id],
  getAllUnits: () => Object.values(comboUnits),
  footprintDistance: () => 1,
  distance: () => 1,
  faceToward() {},
  hasLineOfSight: () => true,
  getUnitElevation: () => 0,
  removeFromBoard() {}
};
window.CJS.DamageCalc = {
  computeAttack(args) {
    lastQteMultiplier = args.qteMultiplier;
    return { miss: false, damage: 10, isCritical: false, breakdown: {} };
  },
  applyDamage() { return { applied: 10, killed: false }; }
};
window.CJS.EffectResolver = { fireTrigger() {}, executeEffect() {} };
window.CJS.StatusManager = {
  canAct: () => true,
  canMove: () => true,
  canUseSkills: () => true,
  isInvisible: () => false
};
window.CJS.CombatLog = {
  record() {},
  logNote() {},
  getTurn: () => 1,
  logMove() {},
  logMiss() {},
  logSkillUse() {}
};
window.CJS.AudioManager = { playSfx() {} };
window.CJS.AnimationBus = { emit() {} };

AH.execute(comboActor, {
  type: 'skill',
  skillId: 'test_combo_strike',
  targetId: 'combo_target',
  qteResult: { grade: 'perfect', multiplier: 1.5, qteType: 'quickpress' }
}, { turnNumber: 1 });
comboActor.turnState.mainActionUsed = false;
comboActor.turnState.apRemaining = 3;
AH.execute(comboActor, {
  type: 'skill',
  skillId: 'test_combo_strike',
  targetId: 'combo_target',
  qteResult: { grade: 'good', multiplier: 1.25, qteType: 'rhythm' }
}, { turnNumber: 1 });
ok('two successful QTEs build chain 2', AH.getComboState(comboActor).chain === 2);
ok('chain 2 grants +25% next attack bonus', AH.getComboBonus(comboActor) === 0.25);
comboActor.turnState.mainActionUsed = false;
comboActor.turnState.apRemaining = 3;
lastQteMultiplier = 0;
AH.execute(comboActor, { type: 'attack', targetId: 'combo_target' }, { turnNumber: 1 });
ok('basic attack consumes +25% combo multiplier', Math.abs(lastQteMultiplier - 1.25) < 0.0001);
ok('non-QTE attack consumes combo chain', AH.getComboState(comboActor).chain === 0);
comboActor.comboState = { chain: 2, lastGrade: 'good', lastQteType: 'rhythm', banner: 2 };
comboActor.turnState = { apRemaining: 3, mainActionUsed: false, cooldowns: {} };
AH.execute(comboActor, { type: 'end_turn' }, { turnNumber: 1 });
ok('end_turn breaks combo chain', AH.getComboState(comboActor).chain === 0);

console.log('\n──────────────────────────────────────────');
console.log(`RESULTS: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log('✅ ALL TESTS PASSED');
process.exit(fail === 0 ? 0 : 1);
