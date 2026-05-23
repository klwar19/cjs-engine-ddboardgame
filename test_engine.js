// test_engine.js — Regression test suite for CJS Combat Simulator
// Tests all repaired integration seams from the code review.
// Run: node test_engine.js
//
// Tests:
//   0. DataStore supports future multi-world categories
//   1. SkillResolver normalization and resolution
//   2. compileUnit preserves skills with overrides
//   3. compileUnit preserves AI fields (behaviorAI, aiRules, loot)
//   4. Recompile preserves turnState (cooldowns, AP)
//   5. Validation accepts override-form skill references
//   6. Custom status created in DataStore is visible
//   7. QTE export naming is correct
//   8. ActionHandler getAvailableActions uses overrides
//   9. AI ownership check
//   10. Validator AI skill-rule checks
//   11. Weapon basic-attack range wiring
//   12. Real gamedata.json loads and normalizes legacy skill arrays
//   13. Existing encounters still start and monsters still act
//   14. Existing skills from real gamedata still execute
// ─────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── SETUP ────────────────────────────────────────────────────────────
const sandbox = {
  window: { CJS: {} },
  document: {
    addEventListener: () => {},
    createElement: () => ({ className: '', innerHTML: '', appendChild: () => {}, querySelectorAll: () => [] }),
    removeEventListener: () => {}
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

// Load modules in dependency order
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
  'effects/value-calc.js',
  'effects/conditions.js',
  'effects/effect-registry.js',
  'effects/effect-resolver.js',
  'combat/combat-log.js',
  'combat/weather-manager.js',
  'combat/stat-compiler.js',
  'combat/status-manager.js',
  'combat/damage-calc.js',
  'combat/dice-service.js',
  'combat/combat-settings.js',
  'combat/action-handler.js',
  'ai/ai-conditions.js',
  'ai/ai-targeting.js',
  'ai/ai-controller.js',
  'combat/combat-manager.js',
  'qte/qte-manager.js',
  'campaign/relationship-tiers.js',
  'campaign/campaign-state.js',
  'campaign/campaign-conditions.js',
  'campaign/campaign-ops.js',
  'campaign/campaign-events.js',
  'campaign/campaign-story-scenes.js'
];

for (const file of loadOrder) {
  const filepath = path.join(__dirname, 'js', file);
  try {
    const code = fs.readFileSync(filepath, 'utf8');
    vm.runInContext(code, sandbox);
  } catch (e) {
    console.error(`LOAD ERROR: ${file}:`, e.message);
    process.exit(1);
  }
}

const CJS = sandbox.window.CJS;
const DS  = CJS.DataStore;
const SC  = CJS.StatCompiler;
const SR  = CJS.SkillResolver;
const SM  = CJS.StatusManager;
const AH  = CJS.ActionHandler;
const DC  = CJS.DamageCalc;
const AI  = CJS.AIController;
const CM  = CJS.CombatManager;
const Log = CJS.CombatLog;
const RealAIConditions = CJS.AIConditions;
const RealAITargeting = CJS.AITargeting;

// ── MOCK COMBAT SYSTEMS ──────────────────────────────────────────────
CJS.GridEngine = {
  init: () => {},
  getUnit: () => null,
  getAllUnits: () => [],
  removeFromBoard: () => {},
  footprintDistance: () => 1,
  getValidMoves: () => [],
  getUnitsInRange: () => [],
  getDims: () => ({ width: 8, height: 8 }),
  getCell: () => ({ terrain: 'empty', unitId: null }),
  isValidMove: () => ({ valid: false }),
  distance: () => 1,
  getTerrain: () => 'empty',
  hasLineOfSight: () => true
};
CJS.CombatSettings = {
  tickAutoScope: () => {},
  getControlMode: () => 'ai',
  shouldAutoThisTurn: () => false,
  getDiceMode: () => 'auto',
  recordDiceRoll: () => {},
  reset: () => {},
  setTeamControl: () => {},
  setDicePromptFn: () => {},
  queueDice: () => {},
  setDiceMode: () => {},
  requestAuto: () => {},
  stopAuto: () => {}
};
CJS.AoE = { getCellsForShape: () => [], unitsInCells: () => [] };
CJS.Pathfinding = { findPath: () => null, stepToward: () => null };
CJS.AITargeting = { pickTarget: () => null, bestAoECell: () => null };
CJS.AIConditions = { evaluate: (cond) => cond === 'default' };

// ── TEST HARNESS ─────────────────────────────────────────────────────
let _passed = 0, _failed = 0;

function assert(label, condition) {
  if (condition) { _passed++; console.log(`  ✅ ${label}`); }
  else { _failed++; console.error(`  ❌ FAIL: ${label}`); }
}

function assertEq(label, actual, expected) {
  if (actual === expected) { _passed++; console.log(`  ✅ ${label} (${JSON.stringify(actual)})`); }
  else { _failed++; console.error(`  ❌ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function assertNear(label, actual, expected, tolerance = 1e-6) {
  if (Math.abs(actual - expected) <= tolerance) {
    _passed++;
    console.log(`  ✅ ${label} (${actual})`);
  } else {
    _failed++;
    console.error(`  ❌ FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// TEST 0: DataStore future-category scaffold
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 0: DataStore future categories ──');

DS.reset();

const zoneId = DS.create('zones', { name: 'Test Zone' });
const cropId = DS.create('crops', { name: 'Test Crop' });
const shopId = DS.create('shops', { name: 'Test Shop' });
const recipeId = DS.create('crafting', { name: 'Test Recipe' });
const foodId = DS.create('food', { name: 'Test Food' });
const materialId = DS.create('materials', { name: 'Test Material' });
const storyId = DS.create('stories', { name: 'Test Story' });
const storyDirectorPackId = DS.create('storyDirectorPacks', { name: 'Test Story Director Pack' });

DS.replace('worlds', 'haven', { id: 'haven', name: 'Haven' });

assertEq('zone ID prefix', zoneId, 'zon_001');
assertEq('crop ID prefix', cropId, 'crp_001');
assertEq('shop ID prefix', shopId, 'shp_001');
assertEq('crafting ID prefix', recipeId, 'rcp_001');
assertEq('food ID prefix', foodId, 'fod_001');
assertEq('material ID prefix', materialId, 'mat_001');
assertEq('story ID prefix', storyId, 'sto_001');
assertEq('story director pack ID prefix', storyDirectorPackId, 'sdp_001');
assertEq('world count exposed', DS.getCounts().worlds, 1);
assertEq('zone count exposed', DS.getCounts().zones, 1);
assert('exportJSON includes future collections', (() => {
  const exported = JSON.parse(DS.exportJSON());
  return exported.worlds && exported.zones && exported.food && exported.materials && exported.crafting && exported.storyDirectorPacks;
})());

DS.reset();

console.log('\n-- TEST 0b: ContentManager legacy duplicate visibility --');

DS.replace('worlds', 'haven', { id: 'haven', name: 'Haven' });
DS.replace('characters', 'bowy', { id: 'bowy', name: 'Bowy', _scope: 'legacy' });
DS.replace('characters', 'haven_bowy', { id: 'haven_bowy', name: 'Bowy', _scope: 'world', _world: 'haven' });
DS.replace('characters', 'garr', { id: 'garr', name: 'Garr' });
DS.replace('characters', 'haven_garr', { id: 'haven_garr', name: 'Garr', _scope: 'world', _world: 'haven' });
DS.replace('characters', 'mitia', { id: 'mitia', name: 'Mitia', _scope: 'universal' });
DS.replace('characters', 'haven_mitia', { id: 'haven_mitia', name: 'Mitia', _scope: 'world', _world: 'haven' });

const visibleCharacterIds = CJS.ContentManager.getVisibleItems('characters').map((entry) => entry.id);
assert('legacy duplicate bowy is hidden when haven_bowy exists',
  !visibleCharacterIds.includes('bowy') && visibleCharacterIds.includes('haven_bowy'));
assert('unscoped draft duplicate garr is hidden when haven_garr exists',
  !visibleCharacterIds.includes('garr') && visibleCharacterIds.includes('haven_garr'));
assert('explicit universal mitia remains visible beside haven_mitia',
  visibleCharacterIds.includes('mitia') && visibleCharacterIds.includes('haven_mitia'));

console.log('\n-- TEST 0c: StateTools + DataStore snapshots --');

DS.replace('skills', 'snapshot_skill', {
  id: 'snapshot_skill',
  name: 'Snapshot Skill',
  effects: [{ effectId: 'burn', overrides: { value: 5 } }]
});
const sourceState = { nested: { value: 1 } };
const producedState = CJS.StateTools.produce(sourceState, draft => {
  draft.nested.value = 2;
});
assertEq('StateTools.produce returns edited clone', producedState.nested.value, 2);
assertEq('StateTools.produce leaves source untouched', sourceState.nested.value, 1);
const skillSnapshot = DS.snapshot('skills', 'snapshot_skill');
skillSnapshot.effects[0].overrides.value = 99;
assertEq('DataStore.snapshot(type,id) is read-only by copy', DS.get('skills', 'snapshot_skill').effects[0].overrides.value, 5);
const collectionSnapshot = DS.snapshot('skills');
collectionSnapshot.snapshot_skill.name = 'Mutated';
assertEq('DataStore.snapshot(type) clones collections', DS.get('skills', 'snapshot_skill').name, 'Snapshot Skill');

DS.reset();

// ── SEED TEST DATA ───────────────────────────────────────────────────
DS.replace('skills', 'firebolt', {
  id: 'firebolt', name: 'Firebolt', power: 10, ap: 1, mp: 3,
  range: 4, element: 'Fire', damageType: 'Magic', scalingStat: 'I',
  cooldown: 2, qte: 'quickpress', aoe: 'none', effects: []
});
DS.replace('skills', 'heal_light', {
  id: 'heal_light', name: 'Heal Light', power: 8, ap: 1, mp: 5,
  range: 3, element: 'Light', damageType: 'Magic', scalingStat: 'I',
  cooldown: 0, qte: 'none', effects: []
});
DS.replace('skills', 'frost_breath', {
  id: 'frost_breath', name: 'Frost Breath', power: 15, ap: 2, mp: 8,
  range: 2, element: 'Water', damageType: 'Magic', scalingStat: 'I',
  cooldown: 3, qte: 'fishing', aoe: 'cone', aoeSize: 2, effects: []
});

// ══════════════════════════════════════════════════════════════════════
// TEST 1: SkillResolver normalization and resolution
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 1: SkillResolver ──');

const n1 = SR.normalize('firebolt');
assert('normalize string → object', n1 && n1.skillId === 'firebolt' && n1.level === 1);

const n2 = SR.normalize({ skillId: 'firebolt', overrides: { power: 20 }, level: 3 });
assertEq('normalize object preserves skillId', n2.skillId, 'firebolt');
assertEq('normalize object preserves level', n2.level, 3);
assertEq('normalize object preserves overrides.power', n2.overrides.power, 20);

assertEq('getSkillId string', SR.getSkillId('firebolt'), 'firebolt');
assertEq('getSkillId object', SR.getSkillId({ skillId: 'heal_light' }), 'heal_light');

const ids = SR.getSkillIds(['firebolt', { skillId: 'heal_light' }]);
assert('getSkillIds mixed array', ids.length === 2 && ids[0] === 'firebolt' && ids[1] === 'heal_light');

const testUnit = { skills: [{ skillId: 'firebolt', overrides: { power: 50, range: 6 }, level: 5 }] };
const resolved = SR.resolveUnitSkill(testUnit, 'firebolt');
assertEq('resolveUnitSkill power override', resolved.power, 50);
assertEq('resolveUnitSkill range override', resolved.range, 6);
assertEq('resolveUnitSkill level preserved', resolved.level, 5);
assertEq('resolveUnitSkill base mp unchanged', resolved.mp, 3);
assertEq('resolveUnitSkill base id preserved', resolved.id, 'firebolt');

// ══════════════════════════════════════════════════════════════════════
// TEST 2: compileUnit preserves skills with overrides
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 2: compileUnit skill preservation ──');

const charWithOverrides = {
  id: 'test_char', name: 'Test Hero', rank: 'F', team: 'player',
  type: 'humanoid', size: '1x1',
  stats: { S: 5, P: 6, E: 5, C: 8, I: 7, A: 6, L: 5 },
  skills: [
    { skillId: 'firebolt', overrides: { power: 30, range: 5 }, level: 2 },
    'heal_light'
  ],
  equipment: [], innatePassives: [], movement: 3
};
const compiled = SC.compileUnit(charWithOverrides, 'test_char');

assert('compiled.skills is array', Array.isArray(compiled.skills));
assertEq('compiled.skills length', compiled.skills.length, 2);

const fbEntry = compiled.skills.find(s => SR.getSkillId(s) === 'firebolt');
assert('firebolt entry exists on compiled unit', !!fbEntry);
assert('firebolt has overrides object', typeof fbEntry === 'object' && !!fbEntry.overrides);
assertEq('firebolt overrides.power = 30', fbEntry.overrides.power, 30);
assertEq('firebolt overrides.range = 5', fbEntry.overrides.range, 5);

const hlEntry = compiled.skills.find(s => SR.getSkillId(s) === 'heal_light');
assert('heal_light entry exists on compiled unit', !!hlEntry);

// ══════════════════════════════════════════════════════════════════════
// TEST 3: compileUnit preserves AI fields
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 3: AI field preservation ──');

const monsterWithAI = {
  id: 'test_monster', name: 'Test Wolf', rank: 'F', team: 'enemy',
  type: 'beast', size: '1x1',
  stats: { S: 6, P: 5, E: 4, C: 2, I: 3, A: 7, L: 3 },
  skills: ['firebolt'], equipment: [], innatePassives: [], movement: 4,
  behaviorAI: 'aggressive',
  aiRules: [
    { priority: 1, condition: 'any_adjacent_enemy', action: 'attack', target: 'lowest_hp' },
    { priority: 2, condition: 'default', action: 'move_toward', target: 'nearest_enemy' }
  ],
  loot: [{ name: 'Wolf Fang', rarity: 'Common', chance: 0.5 }],
  inventory: ['potion_small'],
  statusImmunities: ['freeze']
};
const compiledMon = SC.compileUnit(monsterWithAI, 'test_monster');

assertEq('behaviorAI preserved', compiledMon.behaviorAI, 'aggressive');
assertEq('aiRules length preserved', compiledMon.aiRules.length, 2);
assertEq('aiRules[0].action preserved', compiledMon.aiRules[0].action, 'attack');
assertEq('loot length preserved', compiledMon.loot.length, 1);
assertEq('loot[0].name preserved', compiledMon.loot[0].name, 'Wolf Fang');
assertEq('inventory preserved', compiledMon.inventory.length, 1);
assertEq('statusImmunities preserved', compiledMon.statusImmunities.length, 1);
assertEq('statusImmunities[0] = freeze', compiledMon.statusImmunities[0], 'freeze');

// ══════════════════════════════════════════════════════════════════════
// TEST 4: Recompile preserves turnState
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 4: Recompile preserves live state ──');

compiledMon.turnState = {
  hasMoved: true, mainActionUsed: false, apRemaining: 1,
  bonusAP: 0, cooldowns: { firebolt: 2 }, isDefending: false
};
compiledMon.pos = [3, 4];
compiledMon._defendDRBoost = 5;
compiledMon.currentHP = 30;
compiledMon.activeStatuses = [{ statusId: 'regen', duration: 2, stacks: 1 }];

const recompiled = SC.recompile(compiledMon, monsterWithAI);

assertEq('turnState.hasMoved preserved', recompiled.turnState.hasMoved, true);
assertEq('turnState.apRemaining preserved', recompiled.turnState.apRemaining, 1);
assertEq('cooldowns.firebolt preserved', recompiled.turnState.cooldowns.firebolt, 2);
assert('pos preserved', recompiled.pos[0] === 3 && recompiled.pos[1] === 4);
assertEq('_defendDRBoost preserved', recompiled._defendDRBoost, 5);
assertEq('currentHP preserved', recompiled.currentHP, 30);
assertEq('activeStatuses preserved', recompiled.activeStatuses.length, 1);
assert('compiledStats recomputed', typeof recompiled.compiledStats.S === 'number');
assert('maxHP recomputed', recompiled.maxHP > 0);

// ══════════════════════════════════════════════════════════════════════
// TEST 5: Validation accepts override-form skill references
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 5: Validation with override-form skills ──');

DS.replace('characters', 'val_test', {
  id: 'val_test', name: 'Val Test',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  skills: ['firebolt', { skillId: 'heal_light', overrides: { range: 5 } }],
  equipment: [], innatePassives: []
});
DS.replace('monsters', 'val_mon', {
  id: 'val_mon', name: 'Val Mon',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  skills: [{ skillId: 'frost_breath', overrides: { power: 20 } }],
  equipment: [], innatePassives: [],
  aiRules: [{ priority: 1, condition: 'default', action: 'use_skill:frost_breath', target: 'nearest_enemy' }]
});

const valResult = DS.validate();
const charErrors = valResult.errors.filter(e => e.includes('val_test'));
const monErrors  = valResult.errors.filter(e => e.includes('val_mon'));
const monWarns   = valResult.warnings.filter(w => w.includes('val_mon'));

assertEq('char with override skills: zero errors', charErrors.length, 0);
assertEq('monster with override skills: zero errors', monErrors.length, 0);
assertEq('monster AI rule for own skill: zero warnings', monWarns.length, 0);

// ══════════════════════════════════════════════════════════════════════
// TEST 6: Custom status in DataStore visible to StatusManager
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 6: Custom status visibility ──');

DS.create('statuses', {
  id: 'my_custom_dot', name: 'Custom DoT', icon: '💜',
  category: 'dot', desc: 'Custom damage over time',
  tickDamageType: 'Dark', duration: 3, stackable: false, maxStacks: 1
});

assert('custom status in DataStore', !!DS.get('statuses', 'my_custom_dot'));
const smDef = SM.getStatusDef('my_custom_dot');
assert('StatusManager finds custom status', !!smDef);
assertEq('StatusManager reads tickDamageType', smDef.tickDamageType, 'Dark');

// ══════════════════════════════════════════════════════════════════════
// TEST 7: QTE export naming
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 7: QTE API naming ──');

assert('CJS.QteManager exists', !!CJS.QteManager);
assert('QteManager.trigger is function', typeof CJS.QteManager.trigger === 'function');
assert('CJS.QTEManager does NOT exist (old wrong name)', !CJS.QTEManager);

// ══════════════════════════════════════════════════════════════════════
// TEST 8: ActionHandler uses overrides
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 8: ActionHandler skill resolution ──');

const unitForAH = {
  instanceId: 'ah_test',
  skills: [{ skillId: 'firebolt', overrides: { power: 99, range: 8 }, level: 3 }],
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: {} },
  currentMP: 50, costMod: 0, rangeBonus: 0
};
const avail = AH.getAvailableActions(unitForAH);
const fbAvail = avail.skills.find(s => s.id === 'firebolt');

assert('firebolt in available actions', !!fbAvail);
assertEq('skill.power uses override (99)', fbAvail.skill.power, 99);
assertEq('skill.range uses override (8)', fbAvail.skill.range, 8);
assertEq('skill.level preserved (3)', fbAvail.skill.level, 3);
assertEq('skill.mp from base (3)', fbAvail.skill.mp, 3);

const savedGetUnit = CJS.GridEngine.getUnit;
const savedFootprintDistance = CJS.GridEngine.footprintDistance;
const savedHasLineOfSight = CJS.GridEngine.hasLineOfSight;
const skillRangeTarget = { instanceId: 'skill_range_target', team: 'enemy', pos: [0, 5], currentHP: 10 };
CJS.GridEngine.getUnit = (id) => id === 'skill_range_target' ? skillRangeTarget : null;
CJS.GridEngine.footprintDistance = () => 5;
CJS.GridEngine.hasLineOfSight = () => true;
const skillRangeUnit = {
  instanceId: 'skill_range_user',
  team: 'player',
  pos: [0, 0],
  skills: ['firebolt'],
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: {} },
  currentHP: 20,
  currentMP: 50,
  costMod: 0,
  rangeBonus: 1
};
assertEq('skill validation includes rangeBonus',
  AH.validate(skillRangeUnit, { type: 'skill', skillId: 'firebolt', targetId: 'skill_range_target' }).valid, true);
skillRangeUnit.rangeBonus = 0;
assertEq('skill validation rejects out-of-range without rangeBonus',
  AH.validate(skillRangeUnit, { type: 'skill', skillId: 'firebolt', targetId: 'skill_range_target' }).reason, 'target_out_of_range');
CJS.GridEngine.getUnit = savedGetUnit;
CJS.GridEngine.footprintDistance = savedFootprintDistance;
CJS.GridEngine.hasLineOfSight = savedHasLineOfSight;

const dedupeUnit = {
  currentHP: 40,
  skills: ['basic_attack', 'firebolt'],
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: {} },
  currentMP: 50, costMod: 0, rangeBonus: 0
};
const dedupeAvail = AH.getAvailableActions(dedupeUnit);
assert('basic attack command still available', !!dedupeAvail.attack);
assertEq('basic_attack is hidden from skill buttons',
  dedupeAvail.skills.some(s => s.id === 'basic_attack'), false);

const defendUnit = {
  name: 'Defender',
  currentHP: 20,
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, bonusAP: 0, cooldowns: {} }
};
const defendResult = AH.execute(defendUnit, { type: 'defend' }, { turnNumber: 1 });
assert('defend action succeeds', !!defendResult.success);
assertEq('defend banks next-turn AP', defendUnit.turnState.bonusAP, CJS.CONST.ACTION_ECONOMY.defendAPBonus);

const endTurnUnit = {
  name: 'Closer',
  currentHP: 20,
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, bonusAP: 0, cooldowns: {} }
};
const endTurnResult = AH.execute(endTurnUnit, { type: 'end_turn' }, { turnNumber: 1 });
assert('end turn action succeeds', !!endTurnResult.success);
assertEq('end turn banks next-turn AP', endTurnUnit.turnState.bonusAP, CJS.CONST.ACTION_ECONOMY.endTurnAPBonus);

const fFormulaStats = { S: 7, P: 8, E: 7, C: 4, I: 3, A: 5, L: 4 };
const cFormulaStats = { S: 20, P: 18, E: 22, C: 12, I: 16, A: 14, L: 10 };
const ssrFormulaStats = { S: 80, P: 75, E: 90, C: 60, I: 85, A: 70, L: 65 };

assertEq('F HP uses soft rank base + S/E scaling', CJS.Formulas.calcMaxHP(fFormulaStats, 'F'), 91);
assertEq('F player HP gets plot armor cushion', CJS.Formulas.calcMaxHP(fFormulaStats, 'F', { team: 'player' }), 99);
assertEq('F enemy HP skips plot armor cushion', CJS.Formulas.calcMaxHP(fFormulaStats, 'F', { team: 'enemy' }), 91);
assertEq('compiled F player receives plot armor HP', SC.compileUnit({ id: 'plot_hero', name: 'Plot Hero', team: 'player', rank: 'F', stats: fFormulaStats }, 'plot_hero').maxHP, 99);
assertEq('compiled F enemy does not receive plot armor HP', SC.compileUnit({ id: 'plot_enemy', name: 'Plot Enemy', team: 'enemy', rank: 'F', stats: fFormulaStats }, 'plot_enemy').maxHP, 91);
assertEq('F MP uses soft rank base + I/P/C scaling', CJS.Formulas.calcMaxMP(fFormulaStats, 'F'), 53);
assertEq('C HP uses soft rank base + S/E scaling', CJS.Formulas.calcMaxHP(cFormulaStats, 'C'), 303);
assertEq('C MP uses soft rank base + I/P/C scaling', CJS.Formulas.calcMaxMP(cFormulaStats, 'C'), 204);
assertEq('SSR HP uses soft rank base + S/E scaling', CJS.Formulas.calcMaxHP(ssrFormulaStats, 'SSR'), 1201);
assertEq('SSR MP uses soft rank base + I/P/C scaling', CJS.Formulas.calcMaxMP(ssrFormulaStats, 'SSR'), 925);

assertEq('physical defense rating uses S/E', CJS.Formulas.calcPhysicalDR(fFormulaStats), 7);
assertEq('magic defense rating uses I/P', CJS.Formulas.calcMagicDR(fFormulaStats), 5);
assertEq('chaos defense rating uses L/C', CJS.Formulas.calcChaosDR(fFormulaStats), 4);

const formulaProbe = CJS.Formulas.calcBaseDamage(9, 16, 2, 4);
const expectedFormulaProbe =
  (Math.sqrt(9) * Math.sqrt(16)) +
  (2 * Math.pow(4, 3 / 11)) +
  Math.pow((2 * 9) + (2 * 16), 4 / 5);
assertNear('base damage uses sqrt core + luck exponent dice + power pulse', formulaProbe, expectedFormulaProbe);

function expectedHybridDamage(rawDamage, defenseRating) {
  const flatBlock = Math.floor(defenseRating * 0.5);
  const percentMitigation = Math.min(0.40, defenseRating / (defenseRating + 80));
  return Math.max(1, Math.floor((rawDamage * (1 - percentMitigation)) - flatBlock));
}

const lowDefenseProbe = CJS.Formulas.calcMitigatedDamage(40, 4);
const mediumDefenseProbe = CJS.Formulas.calcMitigatedDamage(40, 20);
const highDefenseProbe = CJS.Formulas.calcMitigatedDamage(200, 120);
assertEq('hybrid mitigation handles low defense rating', lowDefenseProbe.final, expectedHybridDamage(40, 4));
assertEq('hybrid mitigation handles medium defense rating', mediumDefenseProbe.final, expectedHybridDamage(40, 20));
assertEq('hybrid mitigation handles high defense rating', highDefenseProbe.final, expectedHybridDamage(200, 120));
assertEq('hybrid mitigation exposes flat block', highDefenseProbe.flatBlock, 60);
assertNear('hybrid mitigation caps percent reduction at 40%', highDefenseProbe.percentMitigation, 0.4);

const immunityProbe = CJS.Formulas.calcFinalDamage({
  skillPower: 9,
  primaryStat: 16,
  diceRoll: 2,
  luckValue: 4,
  qteMultiplier: 1,
  elementMultiplier: 0,
  dr: 999,
  bonusDamageFlat: 0,
  bonusDamagePercent: 0
});
assertEq('elemental immunity reduces damage to 0', immunityProbe.final, 0);

const minimumDamageProbe = CJS.Formulas.calcFinalDamage({
  skillPower: 0,
  primaryStat: 0,
  diceRoll: 0,
  luckValue: 0,
  qteMultiplier: 1,
  elementMultiplier: 1,
  dr: 999,
  bonusDamageFlat: 1,
  bonusDamagePercent: 0
});
assertEq('non-immune damage floors at 1', minimumDamageProbe.final, 1);

const originalDiceServiceForFormula = CJS.DiceService;
const originalRandomForFormula = Math.random;
CJS.DiceService = {
  d20: () => ({ total: 20 }),
  d12: () => ({ total: 1 }),
  roll: () => ({ total: 2 })
};
Math.random = () => 0.99;
const formulaAttacker = {
  compiledStats: { S: 16, P: 5, E: 5, C: 5, I: 5, A: 5, L: 4 },
  stats: { S: 16, P: 5, E: 5, C: 5, I: 5, A: 5, L: 4 },
  accuracyBonus: 0,
  critBonus: 0,
  critDmgBonus: 0,
  damageFlat: 0,
  damagePercent: 0,
  damageByElement: {},
  basicAttackPower: 9,
  basicAttackRange: 1
};
const formulaTarget = {
  compiledStats: { A: 1 },
  stats: { A: 1 },
  dr: { physical: 0, magic: 0, chaos: 0 },
  currentHP: 999,
  weak: [],
  resist: [],
  immune: []
};
const basicFormulaAttack = DC.computeAttack({
  attacker: formulaAttacker,
  target: { ...formulaTarget },
  skill: null,
  qteMultiplier: 1,
  weaponData: { baseDamage: 9, range: 1, damageType: 'Physical', element: 'Physical' }
});
const skillFormulaAttack = DC.computeAttack({
  attacker: formulaAttacker,
  target: { ...formulaTarget },
  skill: {
    id: 'formula_probe',
    power: 9,
    level: 1,
    scalingStat: 'S',
    dice: '1d6',
    damageType: 'Physical',
    element: 'Physical',
    unavoidable: true
  },
  qteMultiplier: 1,
  weaponData: null
});
Math.random = originalRandomForFormula;
CJS.DiceService = originalDiceServiceForFormula;
assertEq('basic attacks and skills share base damage formula', basicFormulaAttack.damage, skillFormulaAttack.damage);

// ══════════════════════════════════════════════════════════════════════
// TEST 9: AI ownership check — AI should not pick skills the unit doesn't own
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 9: AI skill ownership ──');

// Create a skill that exists globally but the test monster doesn't own
DS.replace('skills', 'mega_blast', {
  id: 'mega_blast', name: 'Mega Blast', power: 100, ap: 1, mp: 0,
  range: 5, element: 'Fire', damageType: 'Magic', scalingStat: 'I',
  cooldown: 0, qte: 'none', effects: []
});

// AI._tryUseSkill should fail because monster doesn't have mega_blast
const aiUnit = {
  instanceId: 'ai_test', team: 'enemy', behaviorAI: 'aggressive',
  skills: [{ skillId: 'firebolt', overrides: {} }],
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: {} },
  currentMP: 50, currentHP: 50, maxHP: 50, rangeBonus: 0, costMod: 0
};
// _tryUseSkill is private, but we can test via decide() with a rule referencing unowned skill
aiUnit.aiRules = [
  { priority: 1, condition: 'default', action: 'use_skill:mega_blast', target: 'nearest_enemy' }
];
// With no targets available (mocked), decide should fall through to end_turn
const aiDecision = AI.decide(aiUnit);
assert('AI does not pick unowned skill mega_blast',
  !aiDecision || aiDecision.type !== 'skill' || aiDecision.skillId !== 'mega_blast');

// ══════════════════════════════════════════════════════════════════════
// TEST 10: Validator catches AI rules referencing skills not in monster's list
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 10: Validator AI rule check ──');

DS.replace('monsters', 'bad_ai_mon', {
  id: 'bad_ai_mon', name: 'Bad AI Mon',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  skills: ['firebolt'],
  equipment: [], innatePassives: [],
  aiRules: [
    { priority: 1, condition: 'default', action: 'use_skill:mega_blast', target: 'nearest_enemy' }
  ]
});

const valResult2 = DS.validate();
const badMonWarns = valResult2.warnings.filter(w => w.includes('bad_ai_mon'));
assert('validator warns about AI rule using unowned skill',
  badMonWarns.some(w => w.includes('mega_blast') && w.includes('not in its skill list')));

// Also test: AI rule referencing non-existent skill should be an ERROR
DS.replace('monsters', 'bad_ai_mon2', {
  id: 'bad_ai_mon2', name: 'Bad AI Mon 2',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  skills: [],
  equipment: [], innatePassives: [],
  aiRules: [
    { priority: 1, condition: 'default', action: 'use_skill:nonexistent_skill', target: 'nearest_enemy' }
  ]
});
const valResult3 = DS.validate();
const badMon2Errors = valResult3.errors.filter(e => e.includes('bad_ai_mon2'));
assert('validator errors on AI rule using non-existent skill',
  badMon2Errors.some(e => e.includes('nonexistent_skill')));

// TEST 10b: AI compatibility aliases + personality fallbacks
console.log('\n-- TEST 10b: AI compatibility + personalities --');

DS.replace('skills', 'test_shock', {
  id: 'test_shock', name: 'Test Shock', power: 10, ap: 1, mp: 0,
  range: 3, element: 'Lightning', damageType: 'Magic', scalingStat: 'I',
  cooldown: 0, qte: 'none', effects: []
});
DS.replace('skills', 'test_raise', {
  id: 'test_raise', name: 'Test Raise', power: 0, ap: 1, mp: 0,
  range: 1, element: 'Dark', damageType: 'Magic', scalingStat: 'I',
  cooldown: 0, qte: 'none', effects: []
});

assert('AI archetype editor metadata includes swarmer', !!CJS.CONST.AI_ARCHETYPE_INFO?.swarmer?.desc);
assert('AI target editor metadata includes self', !!CJS.CONST.AI_TARGET_INFO?.self?.label);

DS.replace('monsters', 'ai_alias_validator', {
  id: 'ai_alias_validator', name: 'AI Alias Validator',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  skills: ['test_shock'],
  equipment: [], innatePassives: [],
  aiRules: [
    { priority: 1, condition: 'skill_off_cooldown:shock', action: 'use_skill:shock', target: 'nearest_enemy' }
  ]
});
const aliasValidation = DS.validate();
assert('DataStore validator accepts owned short AI skill aliases',
  !aliasValidation.errors.concat(aliasValidation.warnings).some(msg => msg.includes('ai_alias_validator')));
const aliasDetailedValidation = CJS.ContentManager.validateReferencesDetailed();
assert('ContentManager validator accepts owned short AI skill aliases',
  !aliasDetailedValidation.issues.some(issue => issue.id === 'ai_alias_validator'));
DS.remove('monsters', 'ai_alias_validator');

const savedAIConditions = CJS.AIConditions;
const savedAITargeting = CJS.AITargeting;
const savedGridForAI = CJS.GridEngine;
const savedPathfindingForAI = CJS.Pathfinding;
CJS.AIConditions = RealAIConditions;
CJS.AITargeting = RealAITargeting;

const aiActor = {
  instanceId: 'ai_alias',
  name: 'Alias Caster',
  team: 'enemy',
  behaviorAI: 'aggressive',
  skills: ['test_shock'],
  pos: [0, 0],
  currentHP: 40,
  maxHP: 40,
  currentMP: 20,
  rangeBonus: 0,
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: { test_shock: 2 } },
  aiRules: [{ priority: 1, condition: 'skill_off_cooldown:shock', action: 'use_skill:shock', target: 'nearest_enemy' }]
};
const aiTargetWeak = {
  instanceId: 'ai_target_weak',
  name: 'Weak Target',
  team: 'player',
  type: 'healer',
  skills: ['heal_light'],
  pos: [0, 2],
  currentHP: 20,
  maxHP: 20,
  compiledStats: { S: 2, I: 4 }
};
const aiTargetStrong = {
  instanceId: 'ai_target_strong',
  name: 'Strong Target',
  team: 'player',
  pos: [0, 3],
  currentHP: 60,
  maxHP: 60,
  compiledStats: { S: 15, I: 8 }
};
const aiAlly = {
  instanceId: 'ai_ally',
  name: 'Ally',
  team: 'enemy',
  pos: [1, 0],
  currentHP: 20,
  maxHP: 20
};
let aiUnits = [aiActor, aiTargetWeak, aiTargetStrong, aiAlly];
CJS.GridEngine = {
  getAllUnits: () => aiUnits,
  getUnit: (id) => aiUnits.find(u => u.instanceId === id) || null,
  footprintDistance: (a, b) => Math.max(Math.abs(a.pos[0] - b.pos[0]), Math.abs(a.pos[1] - b.pos[1])),
  getValidMoves: () => [[0, 4], [3, 3], [1, 1]],
  getDims: () => ({ width: 8, height: 8 }),
  getCell: () => ({ terrain: 'empty', unitId: null }),
  distance: (r1, c1, r2, c2) => Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)),
  hasLineOfSight: () => true,
  isValidMove: () => ({ valid: true })
};
CJS.Pathfinding = {
  findPath: () => null,
  stepToward: ({ to }) => ({ to })
};

let aliasDecision = AI.decide(aiActor);
assert('skill_off_cooldown short alias blocks a cooling skill',
  !aliasDecision || aliasDecision.type !== 'skill' || aliasDecision.skillId !== 'test_shock');

aiActor.turnState.cooldowns.test_shock = 0;
aliasDecision = AI.decide(aiActor);
assertEq('use_skill short alias resolves to owned full skill id', aliasDecision.skillId, 'test_shock');

assert('allies_alive_lt_N evaluates against live allies',
  RealAIConditions.evaluate('allies_alive_lt_3', { unit: aiActor, allUnits: aiUnits }));
assert('allies_alive_gt_N evaluates against live allies',
  RealAIConditions.evaluate('allies_alive_gt_1', { unit: aiActor, allUnits: aiUnits }));

const selfCaster = {
  ...aiActor,
  instanceId: 'self_caster',
  skills: ['test_raise'],
  currentMP: 20,
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: {} },
  aiRules: [{ priority: 1, condition: 'default', action: 'use_skill:test_raise', target: 'self' }]
};
aiUnits = [selfCaster, aiTargetWeak, aiTargetStrong];
const selfDecision = AI.decide(selfCaster);
assertEq('target self returns the acting unit', selfDecision.targetId, 'self_caster');

const threatPick = RealAITargeting.pickTarget('highest_threat_enemy', selfCaster, aiUnits);
assertEq('highest_threat_enemy picks the strongest threat', threatPick.unit.instanceId, 'ai_target_strong');

const healerPick = RealAITargeting.pickTarget('healer_enemy', selfCaster, aiUnits);
assertEq('healer_enemy detects support/healer targets', healerPick.unit.instanceId, 'ai_target_weak');

const tankActor = {
  ...aiActor,
  instanceId: 'tank_actor',
  behaviorAI: 'tank',
  skills: [],
  pos: [0, 0],
  basicAttackRange: 3,
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: {} },
  aiRules: []
};
aiUnits = [tankActor, aiTargetWeak, aiTargetStrong];
const tankDecision = AI.decide(tankActor);
assertEq('tank fallback attacks the highest-threat enemy in range', tankDecision.targetId, 'ai_target_strong');

const cowardActor = {
  ...tankActor,
  instanceId: 'coward_actor',
  behaviorAI: 'coward',
  pos: [0, 0],
  basicAttackRange: 1,
  turnState: { hasMoved: false, mainActionUsed: true, apRemaining: 1, cooldowns: {} }
};
aiUnits = [cowardActor, aiTargetStrong];
const cowardDecision = AI.decide(cowardActor);
assert('coward fallback moves away from the nearest enemy',
  cowardDecision.type === 'move' && cowardDecision.targetPos[0] === 3 && cowardDecision.targetPos[1] === 3);

const summonerActor = {
  ...selfCaster,
  instanceId: 'summoner_actor',
  behaviorAI: 'summoner',
  aiRules: [],
  turnState: { hasMoved: false, mainActionUsed: false, apRemaining: 2, cooldowns: {} }
};
aiUnits = [summonerActor, aiTargetStrong];
const summonerDecision = AI.decide(summonerActor);
assertEq('summoner fallback prefers a self-targeted support skill', summonerDecision.targetId, 'summoner_actor');

CJS.AIConditions = savedAIConditions;
CJS.AITargeting = savedAITargeting;
CJS.GridEngine = savedGridForAI;
CJS.Pathfinding = savedPathfindingForAI;
DS.remove('skills', 'test_shock');
DS.remove('skills', 'test_raise');

// ══════════════════════════════════════════════════════════════════════
// TEST 11: Weapon basic attack range
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 11: Weapon attack range ──');

assert('AH.getAttackRange exists', typeof AH.getAttackRange === 'function');

// Unit with no weapon → melee range 1
const meleeUnit = { equipment: [], rangeBonus: 0 };
assertEq('no weapon → range 1', AH.getAttackRange(meleeUnit), 1);

// Ranged monster without a weapon can still author its own basic attack range
const naturalRangedUnit = { equipment: [], rangeBonus: 0, basicAttackRange: 3 };
assertEq('authored monster range → 3', AH.getAttackRange(naturalRangedUnit), 3);

// Unit with ranged weapon
DS.replace('items', 'test_crossbow', {
  id: 'test_crossbow', name: 'Test Crossbow', slot: 'weapon',
  effects: [], weaponData: { baseDamage: 8, range: 3, damageType: 'Physical', element: 'Physical' }
});
const rangedUnit = { equipment: ['test_crossbow'], rangeBonus: 0 };
assertEq('crossbow -> weapon range 3', AH.getAttackRange(rangedUnit), 3);

// Unit range bonuses no longer extend basic weapon reach.
const bonusUnit = { equipment: ['test_crossbow'], rangeBonus: 2 };
assertEq('crossbow + rangeBonus 2 -> still weapon range 3', AH.getAttackRange(bonusUnit), 3);

const basicBonusUnit = { equipment: ['test_crossbow'], rangeBonus: 2, basicAttackRangeBonus: 1 };
assertEq('crossbow + basic attack range bonus 1 -> range 4', AH.getAttackRange(basicBonusUnit), 4);

// Elemental weapon
DS.replace('items', 'test_frost_staff', {
  id: 'test_frost_staff', name: 'Frost Staff', slot: 'weapon',
  effects: [], weaponData: { baseDamage: 6, range: 3, damageType: 'Magic', element: 'Water' }
});
const mageUnit = { equipment: ['test_frost_staff'], rangeBonus: 0 };
assertEq('frost staff → range 3', AH.getAttackRange(mageUnit), 3);

const originalDiceService = CJS.DiceService;
const originalRandom = Math.random;
CJS.DiceService = {
  d20: () => ({ total: 20 }),
  d12: () => ({ total: 1 }),
  roll: () => ({ total: 2 })
};
Math.random = () => 0.99;
const rangedBasicAttack = DC.computeAttack({
  attacker: {
    compiledStats: { S: 2, P: 20, L: 1 },
    stats: { S: 2, P: 20, L: 1 },
    accuracyBonus: 0,
    critBonus: 0,
    critDmgBonus: 0,
    damageFlat: 0,
    damagePercent: 0,
    damageByElement: {},
    basicAttackRange: 3
  },
  target: {
    compiledStats: { A: 1 },
    stats: { A: 1 },
    dr: { physical: 0, magic: 0, chaos: 0 },
    currentHP: 99,
    weak: [],
    resist: [],
    immune: []
  },
  skill: null,
  qteMultiplier: 1.0,
  weaponData: { baseDamage: 5, range: 3, damageType: 'Physical', element: 'Physical' }
});
Math.random = originalRandom;
CJS.DiceService = originalDiceService;
assertEq('ranged normal attacks scale from P', rangedBasicAttack.breakdown.scalingStat, 'P');

// ══════════════════════════════════════════════════════════════════════
// TEST 12: Real gamedata migration / backward compatibility
console.log('\n── TEST 12: Real gamedata compatibility ──');

function isCanonicalSkillEntry(entry) {
  return !!(
    entry &&
    typeof entry === 'object' &&
    typeof entry.skillId === 'string' &&
    entry.overrides &&
    typeof entry.overrides === 'object' &&
    typeof entry.level === 'number'
  );
}

const realGamedata = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'gamedata.json'), 'utf8')
);

// gamedata.json no longer carries Bowy/Mitia/Garr — those moved to the haven
// world file. Splice the haven characters and the skills/items/passives they
// reference back in so legacy encounter refs still resolve in tests.
function _spliceHavenCollection(target, file, collection) {
  const doc = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'worlds', 'haven', file), 'utf8')
  );
  target[collection] = target[collection] || {};
  for (const entry of (doc.entries || [])) {
    if (!target[collection][entry.id]) target[collection][entry.id] = entry;
  }
}
_spliceHavenCollection(realGamedata, 'characters.json', 'characters');
_spliceHavenCollection(realGamedata, 'skills.json', 'skills');
_spliceHavenCollection(realGamedata, 'items.json', 'items');
_spliceHavenCollection(realGamedata, 'passives.json', 'passives');

DS.reset();
const realLoad = DS.loadData(realGamedata);
assert('real gamedata.json loads successfully', !!realLoad?.success);
assert('real gamedata validation passes', !!realLoad?.validation?.valid);

const realChars = DS.getAllAsArray('characters');
const realMons = DS.getAllAsArray('monsters');
assert('real characters loaded', realChars.length > 0);
assert('real monsters loaded', realMons.length > 0);
assert('legacy character skill arrays normalized on load',
  realChars.every(ch => (ch.skills || []).every(isCanonicalSkillEntry)));
assert('legacy monster skill arrays normalized on load',
  realMons.every(mon => (mon.skills || []).every(isCanonicalSkillEntry)));
assert('real characters no longer duplicate basic_attack in skill lists',
  realChars.every(ch => (ch.skills || []).every(entry => entry.skillId !== 'basic_attack')));
assertEq('legacy thunder shot range normalized to 4', DS.get('skills', 'thunder_shot')?.range, 4);
assertEq('legacy piercing bolt range normalized to 3', DS.get('skills', 'piercing_bolt')?.range, 3);
assertEq('legacy rally range normalized to 2', DS.get('skills', 'rally_cry')?.range, 2);
assertEq('legacy crossbow basic range normalized to 3', DS.get('items', 'thunder_crossbow')?.weaponData?.range, 3);

// Synthesize a marksman to test marksmans_eye passive without depending on a
// legacy "bowy" entry that was removed when haven_bowy became canonical.
DS.replace('characters', 'marksman_test', {
  id: 'marksman_test',
  name: 'Marksman Test',
  team: 'player',
  rank: 'F',
  type: 'humanoid',
  stats: { S: 7, P: 8, E: 7, C: 4, I: 3, A: 5, L: 4 },
  skills: ['thunder_shot', 'piercing_bolt'],
  equipment: ['thunder_crossbow', 'leather_armor', 'warm_boots'],
  innatePassives: ['marksmans_eye', 'iron_hide']
});
const bowyCompiled = SC.compileUnit(DS.get('characters', 'marksman_test'), 'bowy_test');
assertEq('Bowy passive does not add generic skill rangeBonus', bowyCompiled.rangeBonus, 0);
assertEq('Bowy passive adds basic attack range bonus', bowyCompiled.basicAttackRangeBonus, 1);
assertEq('Bowy basic attack range is crossbow 3 plus passive 1', AH.getAttackRange(bowyCompiled), 4);

const exportedReal = JSON.parse(DS.exportJSON());
assert('export keeps character skills normalized',
  Object.values(exportedReal.characters || {}).every(ch => (ch.skills || []).every(isCanonicalSkillEntry)));
assert('export keeps monster skills normalized',
  Object.values(exportedReal.monsters || {}).every(mon => (mon.skills || []).every(isCanonicalSkillEntry)));

assertEq('real gamedata ships with no custom statuses collection entries',
  Object.keys(realGamedata.statuses || {}).length, 0);
assert('built-in status IDs still resolve without DataStore status entries',
  !DS.get('statuses', 'burn') && !!SM.getStatusDef('burn'));

// TEST 13: Existing encounters still start and monsters still act
console.log('\n── TEST 13: Real encounter startup ──');

let liveUnits = {};
CJS.GridEngine = {
  init: (enc, units) => {
    liveUnits = units;
    for (const placement of (enc.units || [])) {
      if (units[placement.id]) {
        units[placement.id].pos = placement.pos;
        units[placement.id].size = placement.size || units[placement.id].size;
      }
    }
  },
  getUnit: (id) => liveUnits[id] || null,
  getAllUnits: () => Object.values(liveUnits),
  removeFromBoard: (id) => { delete liveUnits[id]; },
  footprintDistance: (a, b) => {
    if (!a?.pos || !b?.pos) return 1;
    return Math.abs(a.pos[0] - b.pos[0]) + Math.abs(a.pos[1] - b.pos[1]);
  },
  getValidMoves: () => [],
  getUnitsInRange: (r, c, range, opts = {}) =>
    Object.values(liveUnits)
      .filter(u => u.instanceId !== opts.excludeId)
      .map(unit => ({ unit })),
  getDims: () => ({ width: 8, height: 8 }),
  getCell: () => ({ terrain: 'empty', unitId: null }),
  isValidMove: () => ({ valid: true }),
  distance: (r1, c1, r2, c2) => Math.abs(r1 - r2) + Math.abs(c1 - c2),
  getTerrain: () => 'empty',
  hasLineOfSight: () => true
};
CJS.AITargeting = {
  pickTarget: (spec, unit, allUnits, opts = {}) => {
    const range = opts.range ?? 99;
    const target = (allUnits || Object.values(liveUnits)).find(u =>
      u.team !== unit.team &&
      (u.currentHP || 0) > 0 &&
      CJS.GridEngine.footprintDistance(unit, u) <= range
    );
    return target ? { unit: target } : null;
  },
  bestAoECell: (unit, shape, size, range) => {
    const target = Object.values(liveUnits).find(u =>
      u.team !== unit.team &&
      (u.currentHP || 0) > 0 &&
      CJS.GridEngine.footprintDistance(unit, u) <= range
    );
    return target ? { cell: target.pos } : null;
  }
};

const realEncounterId = Object.keys(realGamedata.encounters || {})[0];
const realEncounter = DS.get('encounters', realEncounterId);
const combatState = CM.startEncounter(realEncounterId);

assert('existing encounter starts from real gamedata', !!combatState);
assertEq('all encounter units compiled into combat state',
  Object.keys(combatState.units).length, (realEncounter.units || []).length);

const openingPhase = CM.step();
const openingUnit = CM.getCurrentUnit();
assertEq('combat advances into action phase from idle', openingPhase, 'action');
assert('opening unit exists after first step', !!openingUnit);
assertEq('turn start grants flat AP regen',
  openingUnit?.turnState?.apRemaining,
  (openingUnit?.baseAP || 0) + CJS.CONST.ACTION_ECONOMY.turnStartAP);

const realPlayer = Object.values(combatState.units).find(u => u.team === 'player');
const realEnemy = Object.values(combatState.units).find(u => u.team === 'enemy');
realPlayer.pos = [0, 0];
realEnemy.pos = [0, 1];

const enemyDecision = AI.decide(realEnemy, { allUnits: Object.values(combatState.units) });
assert('existing monster still produces a non-empty decision',
  !!enemyDecision && enemyDecision.type !== 'end_turn');

// TEST 14: Existing skills from real gamedata still execute
console.log('\n── TEST 14: Real skill execution ──');

realPlayer.turnState = { hasMoved: false, mainActionUsed: false, apRemaining: 3, bonusAP: 0, cooldowns: {} };
realPlayer.currentMP = realPlayer.maxMP || 50;
realEnemy.currentHP = realEnemy.maxHP || realEnemy.currentHP || 50;

const realAvail = AH.getAvailableActions(realPlayer);
const realSkill = realAvail.skills.find(s => s.usable);
assert('real player has at least one usable skill', !!realSkill);

let realAction = null;
if (realSkill) {
  realAction = (realSkill.skill.aoe && realSkill.skill.aoe !== 'none')
    ? { type: 'skill', skillId: realSkill.id, aoeCenter: realEnemy.pos, qteResult: { grade: 'ok', multiplier: 1.0 } }
    : { type: 'skill', skillId: realSkill.id, targetId: realEnemy.instanceId, qteResult: { grade: 'ok', multiplier: 1.0 } };
}
const realExec = realAction ? AH.execute(realPlayer, realAction, { turnNumber: 1 }) : { success: false };
assert('existing skill executes from real gamedata', !!realExec.success);

// TEST 15: Burn tick logs only once
console.log('\n── TEST 15: Burn tick display logging ──');

Log.reset();
Log.setTurn(1);
Log.setPhase('turn_start');

const burnProbe = {
  name: 'Burn Probe',
  team: 'enemy',
  type: 'beast',
  rank: 'F',
  currentHP: 30,
  maxHP: 30,
  dr: { physical: 0, magic: 0, chaos: 0 },
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  compiledStats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  activeStatuses: []
};

const burnApply = SM.applyStatus({
  target: burnProbe,
  statusId: 'burn',
  sourceUnit: null,
  overrides: { value: 4, duration: 2 },
  combatContext: { turnNumber: 1 }
});
assert('burn applied for display probe', !!burnApply.applied);

const tickLogStart = Log.getAll().length;
SM.tickStatuses(burnProbe, 'turn_start');
const burnTickEntries = Log.getAll()
  .slice(tickLogStart)
  .filter(entry => entry.type === 'status_tick' && entry.data?.statusId === 'burn');

assertEq('burn HP drops once from one tick', burnProbe.currentHP, 26);
assertEq('burn produces one status_tick log entry', burnTickEntries.length, 1);
assertEq('burn tick log keeps tick_damage effect', burnTickEntries[0]?.data?.effect, 'tick_damage');

// ═══════════════════════════════════════════════════════════════════════
// TEST 16: Progression — skill AP, char/job XP, skill use logging
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 16: Progression (skill AP / char level / job level) ──');

const F = CJS.Formulas;
assert('Formulas progression API exposed', typeof F.calcSkillLevelForAp === 'function'
  && typeof F.calcSkillApGainPerUse === 'function'
  && typeof F.calcCharLevelForXp === 'function'
  && typeof F.calcJobLevelForXp === 'function'
  && typeof F.calcCharLevelStatBonus === 'function'
  && typeof F.calcJobLevelStatBonus === 'function');

// Author a tiny test skill with a custom AP curve.
const testSkillId = DS.create('skills', {
  name: 'Test Strike', icon: '🧪', power: 5, ap: 1, mp: 0, cooldown: 0,
  damageType: 'Physical', element: null, scalingStat: 'S',
  range: 1, aoe: null, aoeSize: 0, qte: 'none',
  apGain: 2,
  apThresholds: [0, 4, 10, 20, 35, 60],
  levelScaling: { powerPerLevel: 0.15, maxLevel: 6 },
  levelPerks: [
    { level: 2, modifiers: { ap: -1 }, description: '-1 AP cost' },
    { level: 3, modifiers: { power: 5 }, description: '+5 power' }
  ],
  description: ''
});
const testSkill = DS.get('skills', testSkillId);

assertEq('skill defaults to level 1 with no AP', F.calcSkillLevelForAp(testSkill, 0), 1);
assertEq('skill levels up at first threshold (4 AP)', F.calcSkillLevelForAp(testSkill, 4), 2);
assertEq('skill levels at 35 AP → level 5', F.calcSkillLevelForAp(testSkill, 35), 5);
// Global hard cap (PROGRESSION.skillMaxLevelCap = 5) clamps even a higher
// authored maxLevel to 5 for now, until tier-2 content explicitly opts in.
assertEq('skill caps at global hard cap 5', F.calcSkillLevelForAp(testSkill, 9999), 5);
assertEq('skill AP-to-next at level 1 with 0 AP is 4', F.calcSkillApToNextLevel(testSkill, 0, 1), 4);
assert('skill AP-to-next at max is null', F.calcSkillApToNextLevel(testSkill, 9999, 5) === null);

// Skill level perks merge cumulatively into the resolved skill.
const perkedAt2 = F.applySkillLevelPerks(testSkill, 2);
assertEq('perk Lv2 reduces AP from 1 → 0', perkedAt2.ap, 0);
const perkedAt3 = F.applySkillLevelPerks(testSkill, 3);
assertEq('perk Lv3 also adds +5 power on top of base 5 → 10', perkedAt3.power, 10);
const earnedAt3 = F.getEarnedSkillPerks(testSkill, 3);
assertEq('two perks earned by Lv3', earnedAt3.length, 2);
const nextAt3 = F.getNextSkillPerk(testSkill, 3);
assert('no further perk after Lv3 in this skill', nextAt3 == null);
assertEq('AP gain per use scales with QTE perfect (apGain 2 * 1.5 = 3)', F.calcSkillApGainPerUse(testSkill, 'perfect'), 3);
assertEq('AP gain per use floors at 1 even with fail QTE', F.calcSkillApGainPerUse(testSkill, 'fail'), 1);

// Char XP curve from CONST defaults.
assertEq('char level 1 with 0 XP', F.calcCharLevelForXp(0), 1);
assertEq('char level 2 at 50 XP', F.calcCharLevelForXp(50), 2);
assertEq('char level 3 at 120 XP', F.calcCharLevelForXp(120), 3);
assert('char xpToNext for level 1 is positive', (F.calcCharXpToNextLevel(0, 1) || 0) > 0);

// Char level stat bonus: F-rank gains 1 stat point per level-up; D-rank gains 2.
const baseStats = { S: 8, P: 4, E: 5, C: 3, I: 6, A: 7, L: 2 };
const bonusF3 = F.calcCharLevelStatBonus('F', 3, baseStats);
const totalF3 = Object.values(bonusF3).reduce((s, v) => s + v, 0);
assertEq('F-rank level 3 grants 1 × 2 = 2 stat points', totalF3, 2);
const bonusD5 = F.calcCharLevelStatBonus('D', 5, baseStats);
const totalD5 = Object.values(bonusD5).reduce((s, v) => s + v, 0);
assertEq('D-rank level 5 grants 2 × 4 = 8 stat points', totalD5, 8);
const bonusFFirst = F.calcCharLevelStatBonus('F', 2, baseStats);
assertEq('F level-up favors highest base stat (S=8)', bonusFFirst.S, 1);

// Job system
const testJob = {
  id: 'job_test',
  name: 'Tester',
  maxLevel: 5,
  xpThresholds: [0, 10, 25, 50, 100],
  levels: [
    { level: 1, statBonus: { S: 1 } },
    { level: 2, statBonus: { S: 1, E: 1 }, grantsSkills: [testSkillId] },
    { level: 3, statBonus: { S: 2 }, grantsPassives: ['fake_passive'] },
    { level: 4, statBonus: { I: 2 } },
    { level: 5, statBonus: { S: 3, E: 3 } }
  ]
};
DS.create('jobs', testJob);
assertEq('job level 1 from 0 xp', F.calcJobLevelForXp(testJob, 0), 1);
assertEq('job level 3 at 25 xp', F.calcJobLevelForXp(testJob, 25), 3);
assertEq('job caps at maxLevel', F.calcJobLevelForXp(testJob, 99999), 5);
const jobBonus3 = F.calcJobLevelStatBonus(testJob, 3);
assertEq('job lvl 3 cumulative S = 1+1+2 = 4', jobBonus3.S, 4);
assertEq('job lvl 3 cumulative E = 0+1+0 = 1', jobBonus3.E, 1);
const jobGrants3 = F.collectJobGrants(testJob, 3);
assert('job grants test skill at lvl ≥ 2', jobGrants3.skills.includes(testSkillId));
assert('job grants passive at lvl ≥ 3', jobGrants3.passives.includes('fake_passive'));
const jobGrants1 = F.collectJobGrants(testJob, 1);
assert('job grants nothing at lvl 1', !jobGrants1.skills.length && !jobGrants1.passives.length);

// DataStore registers the new jobs collection
assert('DataStore exposes jobs counts', typeof DS.getCounts().jobs === 'number');
const cleanupSkillId = testSkillId;
const apprenticeId = DS.create('characters', {
  name: 'Apprentice', team: 'player', rank: 'F', type: 'humanoid',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  skills: [{ skillId: cleanupSkillId, overrides: {}, level: 1 }],
  equipment: [], innatePassives: []
});
const skUserBase = DS.get('characters', apprenticeId);
const skUser = SC.compileUnit(skUserBase, 'apprentice_inst');
skUser.pos = [0, 0];
skUser.turnState = { hasMoved: false, mainActionUsed: false, apRemaining: 5, bonusAP: 0, cooldowns: {} };

const dummyId = DS.create('characters', {
  name: 'Dummy', team: 'enemy', rank: 'F', type: 'humanoid',
  stats: { S: 1, P: 1, E: 1, C: 1, I: 1, A: 1, L: 1 },
  skills: [], equipment: [], innatePassives: []
});
const skTargetBase = DS.get('characters', dummyId);
const skTarget = SC.compileUnit(skTargetBase, 'dummy_inst');
skTarget.pos = [0, 1];
skTarget.turnState = { hasMoved: false, mainActionUsed: false, apRemaining: 2, bonusAP: 0, cooldowns: {} };

const previousGE = CJS.GridEngine;
CJS.GridEngine = {
  getUnit: (id) => id === skUser.instanceId ? skUser : skTarget,
  getAllUnits: () => [skUser, skTarget],
  footprintDistance: () => 1,
  distance: () => 1,
  hasLineOfSight: () => true,
  removeFromBoard: () => {},
  getDims: () => ({ width: 8, height: 8 })
};

const skResult = AH.execute(skUser, {
  type: 'skill',
  skillId: cleanupSkillId,
  targetId: skTarget.instanceId,
  qteResult: { grade: 'perfect', multiplier: 1.5, qteType: 'none' }
}, { turnNumber: 1 });
CJS.GridEngine = previousGE;

assert('skill use returns success', !!skResult.success);
assertEq('skill use logs one count', skUser.skillUseLog?.[cleanupSkillId]?.count, 1);
assertEq('skill use logs the perfect QTE', skUser.skillUseLog?.[cleanupSkillId]?.qteCounts?.perfect, 1);

// Cleanup so later runs don't accumulate test data
DS.remove('skills', cleanupSkillId);
DS.remove('jobs', 'job_test');
DS.remove('characters', apprenticeId);
DS.remove('characters', dummyId);

// ═══════════════════════════════════════════════════════════════════════
// TEST 17: Job tree (branches, tiers, unlock eligibility)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 17: Job tree branches ──');

const branchTier1 = {
  id: 'job_t1', name: 'T1', branch: 'br1', tier: 1, maxLevel: 5,
  levels: [{ level: 1, statBonus: { S: 1 } }]
};
const branchTier2 = {
  id: 'job_t2', name: 'T2', branch: 'br1', tier: 2,
  unlockRequirement: { jobId: 'job_t1', minLevel: 5 },
  maxLevel: 5,
  levels: [{ level: 1, statBonus: { S: 2 } }]
};
const branchOther = {
  id: 'job_other', name: 'Other', branch: 'br2', tier: 1, maxLevel: 5,
  levels: [{ level: 1 }]
};
DS.create('jobs', branchTier1);
DS.create('jobs', branchTier2);
DS.create('jobs', branchOther);

const treeJobs = DS.getAll('jobs');

// Member with branch br1 only, max 3 jobs, t1 unlocked at level 1.
let testMember = {
  unlockedJobs: ['job_t1'],
  jobProgress: { job_t1: { xp: 0, level: 1 } },
  availableBranches: ['br1'],
  baseAvailableJobs: ['job_t1'],
  maxJobs: 3
};

let elig = F.canUnlockJob(branchTier2, testMember, treeJobs);
assert('tier-2 locked while prereq below minLevel', !elig.ok && elig.reason === 'prereq_level_low');

testMember.jobProgress.job_t1.level = 5;
elig = F.canUnlockJob(branchTier2, testMember, treeJobs);
assert('tier-2 unlocks once prereq hits minLevel', !!elig.ok);

elig = F.canUnlockJob(branchOther, testMember, treeJobs);
assert('other-branch job blocked when not in availableBranches', !elig.ok && elig.reason === 'branch_not_available');

testMember.maxJobs = 1;
elig = F.canUnlockJob(branchTier2, testMember, treeJobs);
assert('slot cap blocks unlock when full', !elig.ok && elig.reason === 'max_jobs_reached');

DS.remove('jobs', 'job_t1');
DS.remove('jobs', 'job_t2');
DS.remove('jobs', 'job_other');

// ═══════════════════════════════════════════════════════════════════════
// TEST 18: Per-enemy XP table values exist
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 18: XP-per-enemy progression table ──');
const PROG = CJS.CONST?.PROGRESSION || {};
assert('xpPerEnemyRank table exists', PROG.xpPerEnemyRank && PROG.xpPerEnemyRank.F > 0);
assert('jobXpPerEnemyRank table exists', PROG.jobXpPerEnemyRank && PROG.jobXpPerEnemyRank.F > 0);
assert('xp scales up with rank', PROG.xpPerEnemyRank.A > PROG.xpPerEnemyRank.F);
assert('default skill cap is now 5', PROG.skillMaxLevelDefault === 5);
assertEq('default job cap is 5', PROG.jobMaxLevelDefault, 5);

// ═══════════════════════════════════════════════════════════════════════
// TEST 19: Skill / passive selection budget (SP + slot caps)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 19: SP / slot budget ──');

// Author 5 simple skills and a member with the default 4-slot / 4-SP budget.
const sp1 = DS.create('skills', { name: 'A', power: 5, ap: 1, mp: 0, scalingStat: 'S', range: 1, qte: 'none', spCost: 1, levelScaling: { maxLevel: 5 } });
const sp2 = DS.create('skills', { name: 'B', power: 5, ap: 1, mp: 0, scalingStat: 'S', range: 1, qte: 'none', spCost: 1, levelScaling: { maxLevel: 5 } });
const sp3 = DS.create('skills', { name: 'C', power: 5, ap: 1, mp: 0, scalingStat: 'S', range: 1, qte: 'none', spCost: 1, levelScaling: { maxLevel: 5 } });
const sp4 = DS.create('skills', { name: 'D', power: 5, ap: 1, mp: 0, scalingStat: 'S', range: 1, qte: 'none', spCost: 1, levelScaling: { maxLevel: 5 } });
const sp5 = DS.create('skills', { name: 'E (heavy)', power: 5, ap: 1, mp: 0, scalingStat: 'S', range: 1, qte: 'none', spCost: 3, levelScaling: { maxLevel: 5 } });

const memberWithPool = {
  baseCharacterId: 'fake_base',
  level: 1, rank: 'F',
  skillSlots: 4, passiveSlots: 3, skillPoints: 10, passivePoints: 10,
  equippedSkills: [sp1, sp2],
  equippedPassives: []
};
const baseFake = { stats: { S: 5 } };
assertEq('effective skill slots = base 4 (no level/rank/job/item bonuses)', F.calcEffectiveSkillSlots(memberWithPool, baseFake), 4);
assertEq('effective skill points = base 10 (new starting budget)', F.calcEffectiveSkillPoints(memberWithPool, baseFake), 10);
assertEq('current SP usage from 2x cost-1 = 2', F.calcEquippedSpCost([sp1, sp2], 'skills'), 2);
assertEq('SP cost of heavy skill = 3', F.calcSpCost(DS.get('skills', sp5)), 3);

// Per-level cadence: at level 4 we should gain +1 skill point per the
// PROGRESSION.skillPointsPerCharLevel cadence (every: 3).
memberWithPool.level = 4;
assertEq('level 4 grants +1 skill point (every-3 cadence)', F.calcEffectiveSkillPoints(memberWithPool, baseFake), 11);

// Slots are deliberately slow: PROGRESSION.skillSlotsPerCharLevel.every = 10.
memberWithPool.level = 11;
assertEq('level 11 grants +1 skill slot (every-10 cadence)', F.calcEffectiveSkillSlots(memberWithPool, baseFake), 5);
memberWithPool.level = 9;
assertEq('level 9 still 4 skill slots (cadence not yet hit)', F.calcEffectiveSkillSlots(memberWithPool, baseFake), 4);

// Rank E grants +2 skill points per CONST.PROGRESSION.rankSkillPointBonus.
memberWithPool.rank = 'E';
memberWithPool.level = 1;
assertEq('rank E grants +2 skill points baseline', F.calcEffectiveSkillPoints(memberWithPool, baseFake), 12);

DS.remove('skills', sp1);
DS.remove('skills', sp2);
DS.remove('skills', sp3);
DS.remove('skills', sp4);
DS.remove('skills', sp5);

// ═══════════════════════════════════════════════════════════════════════
// TEST 20: Cooking refuses without ingredients, succeeds with them
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 20: Cooking ingredient gating ──');
// We bypass the full CampaignState/CampaignOps wiring (browser-only) and
// hit the bundle helpers directly via a tiny synthetic state shape.
// _hasBundle / _missingBundleSummary live inside CampaignOps's IIFE; we
// can still verify behavior via the public dispatcher when CampaignState
// is loaded. Skip if not present in the test sandbox.
if (CJS.CampaignOps && CJS.CampaignState) {
  CJS.CampaignState.setState({
    party: {}, currencies: {}, inventory: { items: {}, materials: {}, food: {}, questItems: {}, equipment: {} },
    quests: {}, flags: {}, log: [], pinnedNotes: [],
    pocketHaven: { enabled: true, notes: [], farm: { plots: [] }, stations: [] },
    sideContent: {}, hubState: {}, scenarioHistory: [], mapState: {},
    phase: { number: 1, type: 'town_phase', name: 'Town' }, currentWorld: 'haven', currentChapter: 1
  });
  // Cook with no ingredients → log line about "missing"
  CJS.CampaignOps.apply({
    op: 'cook_basic', id: 'warm_stew', label: 'Warm Stew',
    inputs: { materials: { haven_bear_hide: 1, haven_ice_crystal: 1 } },
    outputs: { food: { warm_stew: 1 } }
  }, { source: 'test' });
  let foodCount = CJS.CampaignState.getState().inventory.food.warm_stew || 0;
  assertEq('cook refused without ingredients (food still 0)', foodCount, 0);
  assert('cook refusal logged', CJS.CampaignState.getState().log.some((l) => /missing/i.test(l.text || '')));

  // Now grant ingredients and try again.
  CJS.CampaignOps.apply([
    { op: 'give_material', id: 'haven_bear_hide', qty: 1 },
    { op: 'give_material', id: 'haven_ice_crystal', qty: 1 }
  ], { source: 'test' });
  CJS.CampaignOps.apply({
    op: 'cook_basic', id: 'warm_stew', label: 'Warm Stew',
    inputs: { materials: { haven_bear_hide: 1, haven_ice_crystal: 1 } },
    outputs: { food: { warm_stew: 1 } }
  }, { source: 'test' });
  foodCount = CJS.CampaignState.getState().inventory.food.warm_stew || 0;
  assertEq('cook succeeds once ingredients are stocked', foodCount, 1);
  const remainingHide = CJS.CampaignState.getState().inventory.materials.haven_bear_hide || 0;
  assertEq('hide consumed', remainingHide, 0);
} else {
  console.log('  (skipping — CampaignOps not loaded in this test sandbox)');
}

// ═══════════════════════════════════════════════════════════════════════
// TEST 21: Story scene normalization and gated node entry
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 21: Campaign story scene flow ──');
if (CJS.CampaignStoryScenes && CJS.CampaignState && CJS.CampaignOps) {
  DS.replace('stories', 'story_flow_test_scene', {
    id: 'story_flow_test_scene',
    title: 'Story Flow Test',
    story_sequence: [{ speaker: 'System', line: 'Legacy line format still plays.' }],
    choices: [{
      label: 'Spend JP and speak clearly',
      requiresFlags: ['route_open'],
      jpCost: 1,
      statCheck: { stat: 'C', dc: 10 },
      successOps: [{ op: 'set_flag', flag: 'story_choice_success' }],
      failOps: [{ op: 'set_flag', flag: 'story_choice_fail' }]
    }]
  });
  CJS.CampaignState.loadContentFromDataStore();
  CJS.CampaignState.setState({
    campaignId: 'test_campaign',
    currentWorld: 'haven',
    currentChapter: 1,
    phase: { number: 1, type: 'town_phase', name: 'Town' },
    party: {},
    currencies: { jp: 1 },
    inventory: { items: {}, materials: {}, food: {}, questItems: {}, equipment: {} },
    quests: {},
    flags: { route_open: true },
    log: [],
    pinnedNotes: [],
    pocketHaven: { enabled: true, notes: [], farm: { plots: [] }, stations: [], incomeNodes: [] },
    sideContent: {},
    hubState: {},
    scenarioHistory: [],
    mapState: { map_story_test: {} },
    activeScenarioRun: {
      scenarioId: 'test_scenario',
      mapId: 'map_story_test',
      currentNode: 'node_a',
      completedBeats: [],
      completedBattles: [],
      notes: [],
      proceduralMap: {
        id: 'map_story_test',
        nodes: [{ id: 'node_a', title: 'Node A', storySceneId: 'missing_story_scene', entryPolicy: 'once' }]
      }
    },
    storyChoices: 'legacy_bad_value'
  });

  const normalizedStoryState = CJS.CampaignState.getState();
  const scene = CJS.CampaignStoryScenes.getScene('story_flow_test_scene');
  assert('campaign content exposes stories category', !!CJS.CampaignState.getContent().stories.story_flow_test_scene);
  assert('storyChoices legacy value normalizes to array', Array.isArray(normalizedStoryState.storyChoices));
  assert('map state entryResolved normalizes', !!normalizedStoryState.mapState.map_story_test.entryResolved);
  assertEq('legacy story_sequence normalizes as line', scene.lines.length, 1);
  assertEq('choice jpCost normalizes', scene.choices[0].jpCost, 1);

  const available = CJS.CampaignStoryScenes.choiceAvailability(scene.choices[0]);
  const blocked = CJS.CampaignStoryScenes.choiceAvailability({ label: 'Blocked', requiresFlags: ['missing_flag'], jpCost: 2 });
  assert('flag and JP gated choice can pass', available.ok);
  assert('missing flag and JP gated choice blocks', !blocked.ok && blocked.reasons.length >= 2);

  const preview = CJS.CampaignStoryScenes.previewChoiceOps(scene, scene.choices[0]);
  assert('choice preview includes JP spend', preview.some((op) => op.op === 'take_jp' && op.amount === 1));
  assert('choice preview wraps stat check consequences', preview.some((op) => op.op === 'roll_check' && op.success?.some?.((next) => next.op === 'set_flag')));

  const node = CJS.CampaignState.getState().activeScenarioRun.proceduralMap.nodes[0];
  const prepared = CJS.CampaignStoryScenes.prepareNodeEntry(node, CJS.CampaignState.getState().activeScenarioRun.proceduralMap, {
    mapId: 'map_story_test',
    source: 'test'
  });
  assert('one-time story node prepares pending entry even if scene is missing', prepared);
  assert('pending node entry stored on active run', !!CJS.CampaignState.getState().activeScenarioRun.pendingNodeEntry);
  assert('pending node entry can finish without applying node effects', CJS.CampaignStoryScenes.finishPendingNodeEntry({ skipNodeEffects: true }));
  assert('one-time node entry marks resolved', !!CJS.CampaignState.getState().mapState.map_story_test.entryResolved.node_a);
  assertEq('resolved one-time node does not prepare again', CJS.CampaignStoryScenes.prepareNodeEntry(node, CJS.CampaignState.getState().activeScenarioRun.proceduralMap, { mapId: 'map_story_test' }), false);
} else {
  console.log('  (skipping — Campaign story modules not loaded in this test sandbox)');
}

// ═══════════════════════════════════════════════════════════════════════
// TEST 22: Captured node income applies on phase pass
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 22: Captured resource income ──');
if (CJS.CampaignOps && CJS.CampaignState) {
  CJS.CampaignState.setState({
    campaignId: 'test_campaign',
    currentWorld: 'haven',
    currentChapter: 1,
    phase: { number: 1, type: 'town_phase', name: 'Town' },
    party: {},
    currencies: {},
    inventory: { items: {}, materials: {}, food: {}, questItems: {}, equipment: {} },
    quests: {},
    flags: {},
    log: [],
    pinnedNotes: [],
    pocketHaven: { enabled: true, notes: [], farm: { plots: [] }, stations: [], incomeNodes: {} },
    sideContent: {},
    hubState: {},
    scenarioHistory: [],
    mapState: {},
    activeScenarioRun: { scenarioId: 'test_scenario', mapId: 'map_income_test', currentNode: 'vein', completedBeats: [], completedBattles: [], notes: [] },
    storyChoices: []
  });

  CJS.CampaignOps.apply({
    op: 'capture_node',
    mapId: 'map_income_test',
    nodeId: 'vein',
    title: 'Test Vein',
    incomeOps: [{ op: 'give_material', id: 'haven_sprite_dust', qty: 1 }]
  }, { source: 'test' });
  let incomeState = CJS.CampaignState.getState();
  assert('capture marks map node captured', !!incomeState.mapState.map_income_test.captured.vein);
  assert('capture registers Pocket Haven income node', Object.keys(incomeState.pocketHaven.incomeNodes).length === 1);

  CJS.CampaignOps.apply({ op: 'pass_phase' }, { source: 'test' });
  incomeState = CJS.CampaignState.getState();
  assertEq('phase pass grants captured-node material income', incomeState.inventory.materials.haven_sprite_dust, 1);
  assert('income production appears in log', incomeState.log.some((entry) => /Income produced: Test Vein/.test(entry.text || '')));
} else {
  console.log('  (skipping — CampaignOps not loaded in this test sandbox)');
}

console.log('\n── TEST 23: Persona system (world skins) ──');
if (CJS.CampaignState && CJS.CampaignOps && CJS.PersonaService) {
  DS.reset();
  DS.replace('worlds', 'haven', { id: 'haven', displayName: 'Haven' });
  DS.replace('worlds', 'zombie', { id: 'zombie', displayName: 'Last Light' });
  DS.replace('characters', 'bin', {
    id: 'bin', name: 'Bin Chen', team: 'player', rank: 'F',
    stats: { S: 5, P: 6, E: 5, C: 8, I: 7, A: 6, L: 5 },
    skills: [], equipment: [], innatePassives: [],
    availableJobs: [], defaultJob: null,
    allowedWeaponTypes: ['sword'], allowedArmorTypes: ['light']
  });
  DS.replace('personas', 'persona_bin_haven_adv', {
    id: 'persona_bin_haven_adv', name: 'Adventurer', characterId: 'bin', world: 'haven',
    statOverrides: { S: 1, A: 1 },
    skills: [], equipment: [], innatePassives: [],
    allowedWeaponTypes: ['sword'], allowedArmorTypes: ['light'],
    unlock: { default: true },
    crossWorldPenalty: { statFlat: { S: -2 }, damageDealtMultiplier: 0.7, damageTakenMultiplier: 1.3 }
  });
  DS.replace('personas', 'persona_bin_zombie_scavenger', {
    id: 'persona_bin_zombie_scavenger', name: 'Scavenger', characterId: 'bin', world: 'zombie',
    statOverrides: { P: 2, A: 1 },
    skills: [], equipment: [], innatePassives: [],
    unlock: { default: true, world: 'zombie' },
    crossWorldPenalty: { damageDealtMultiplier: 0.85, damageTakenMultiplier: 1.15 }
  });
  DS.replace('personas', 'persona_bin_zombie_leader', {
    id: 'persona_bin_zombie_leader', name: 'Survivor Leader', characterId: 'bin', world: 'zombie',
    statOverrides: { C: 3 },
    skills: [], equipment: [], innatePassives: [],
    unlock: { requiresPhaseNumber: 4, world: 'zombie' },
    crossWorldPenalty: { damageDealtMultiplier: 0.9 }
  });
  DS.replace('campaigns', 'cmp_test', {
    id: 'cmp_test', name: 'Test Campaign', world: 'haven', startPhase: 'town_phase',
    phaseRules: [{ id: 'town_phase', name: 'Town' }, { id: 'travel_phase', name: 'Travel' }],
    startingState: { party: ['bin'], currencies: { haven_gold: 100 }, items: {}, materials: {}, food: {}, questItems: {} }
  });
  CJS.CampaignState.loadContentFromDataStore();
  const personaSave = CJS.CampaignState.createNewSave('cmp_test');
  const binMember = personaSave.party.bin;
  assert('member.unlockedPersonas exists after save creation', Array.isArray(binMember.unlockedPersonas));
  assert('haven adventurer auto-unlocked (default)', binMember.unlockedPersonas.includes('persona_bin_haven_adv'));
  assert('zombie scavenger auto-unlocked (default but wrong world — should NOT unlock yet)',
    !binMember.unlockedPersonas.includes('persona_bin_zombie_scavenger'));
  assert('survivor leader not unlocked (phase too low)', !binMember.unlockedPersonas.includes('persona_bin_zombie_leader'));
  assertEq('active persona seeded for current world', binMember.activePersona, 'persona_bin_haven_adv');

  // Switch to a different persona via the op
  CJS.CampaignOps.apply({ op: 'set_persona', target: 'bin', personaId: 'persona_bin_haven_adv' }, { source: 'test' });
  assertEq('set_persona keeps active persona on same id', CJS.CampaignState.getState().party.bin.activePersona, 'persona_bin_haven_adv');

  // Cross-world penalty: stamp the haven adventurer into the zombie world
  CJS.CampaignState.mutate((s) => { s.currentWorld = 'zombie'; });
  const penalty = CJS.PersonaService.crossWorldPenalty(CJS.CampaignState.getState().party.bin, 'zombie');
  assert('cross-world penalty is non-null when out of world', !!penalty);
  assertEq('cross-world damage dealt multiplier', Number(penalty.damageDealtMultiplier), 0.7);

  // Snapshot stats should drop S by the flat penalty
  const snapStats = CJS.PersonaService.computeSnapshotStats({ S: 5, P: 6, E: 5, C: 8, I: 7, A: 6, L: 5 }, CJS.CampaignState.getState().party.bin, 'zombie');
  assert('persona snapshot stats drop S out of world', Number(snapStats.S) <= 5);

  // Phase-locked unlock: pass to phase 4, evaluate
  CJS.CampaignState.mutate((s) => { s.phase = { number: 4, type: 'town_phase', name: 'Town' }; });
  CJS.CampaignOps.apply({ op: 'evaluate_persona_unlocks', target: 'bin' }, { source: 'test' });
  // The survivor leader requires world=zombie AND phase>=4 — both satisfied now.
  assert('survivor leader unlocks at phase 4 (zombie world)',
    CJS.CampaignState.getState().party.bin.unlockedPersonas.includes('persona_bin_zombie_leader'));

  // Switch personas — verify loadout swap preserves slots
  CJS.CampaignOps.apply({ op: 'set_persona', target: 'bin', personaId: 'persona_bin_zombie_leader' }, { source: 'test' });
  const switched = CJS.CampaignState.getState().party.bin;
  assertEq('switch_persona updates active', switched.activePersona, 'persona_bin_zombie_leader');
  assert('persona progress slot retains stat overrides from leader',
    Number(switched.statOverrides.C || 0) === 3);

  // Auto-switch on world transition: travel from zombie back to haven and the
  // engine should re-activate the haven adventurer persona automatically.
  CJS.CampaignState.mutate((s) => { s.currentWorld = 'zombie'; });
  CJS.CampaignOps.apply({ op: 'world_transition', toWorld: 'haven' }, { source: 'test' });
  const afterTravel = CJS.CampaignState.getState().party.bin;
  assertEq('world_transition auto-switches to a haven persona', afterTravel.activePersona, 'persona_bin_haven_adv');

  // PersonaService.crossWorldDamageMods reflects the persona's authored values
  // even without loading the full combat bridge — sufficient to confirm the
  // numbers feeding the snapshot path are correct.
  CJS.CampaignState.mutate((s) => { s.currentWorld = 'zombie'; });
  CJS.CampaignState.mutate((s) => { s.party.bin.activePersona = 'persona_bin_haven_adv'; });
  const mods = CJS.PersonaService.crossWorldDamageMods(CJS.CampaignState.getState().party.bin, 'zombie');
  assertNear('cross-world damage dealt mod for haven adv in zombie', mods.dealt, 0.7, 0.001);
  assertNear('cross-world damage taken mod for haven adv in zombie', mods.taken, 1.3, 0.001);
} else {
  console.log('  (skipping — PersonaService not loaded in this test sandbox)');
}

// ────────────────────────────────────────────────────────────────────
// TEST 24: Weather system (environment events)
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 24: Weather / environment events ──');

DS.reset();

// Seed a couple of weather defs in the data store
DS.replace('weathers', 'normal', {
  id: 'normal', name: 'Clear', icon: '☀️',
  damageMods: {}, statMods: {}, tick: null, statusInteractions: [], immuneTags: []
});
DS.replace('weathers', 'rain', {
  id: 'rain', name: 'Rain', icon: '🌧',
  damageMods: { Water: 1.5, Fire: 0.5 },
  statMods: { accuracyBonus: -3 },
  tick: null,
  statusInteractions: [{ statusId: 'burn', extendDuration: -1 }],
  immuneTags: ['water_native']
});
DS.replace('weathers', 'blizzard', {
  id: 'blizzard', name: 'Blizzard', icon: '❄',
  damageMods: { Ice: 1.5 },
  statMods: {},
  tick: { phase: 'turn_end', damageType: 'Magic', element: 'Ice', amount: 3, targetTeams: ['all'] },
  statusInteractions: [{ statusId: 'freeze', extendDuration: 1 }],
  immuneTags: []
});

const WX = CJS.Weather;
assert('Weather module loaded', !!WX);

// Damage multiplier lookups
const state = { environment: { id: 'rain', remaining: 3 } };
assertEq('Rain boosts Water', WX.applyDamageMods('Water', state), 1.5);
assertEq('Rain weakens Fire', WX.applyDamageMods('Fire', state), 0.5);
assertEq('Rain neutral on Ice', WX.applyDamageMods('Ice', state), 1);

// Stat mods stamp + restamp idempotence
const fakeUnit = { accuracyBonus: 10 };
WX.applyStatModsToUnit(fakeUnit, state);
assertEq('Rain applies accuracyBonus -3', fakeUnit.accuracyBonus, 7);
WX.applyStatModsToUnit(fakeUnit, state);
assertEq('Re-stamp is idempotent', fakeUnit.accuracyBonus, 7);
WX.applyStatModsToUnit(fakeUnit, { environment: { id: 'normal' } });
assertEq('Switching to normal removes weather mod', fakeUnit.accuracyBonus, 10);

// Status interaction (rain shortens burn)
const adjusted = WX.modifyStatusDuration('burn', 3, state);
assertEq('Rain shortens burn duration by 1', adjusted, 2);
const noChange = WX.modifyStatusDuration('poison', 3, state);
assertEq('Non-listed status not adjusted', noChange, 3);

// setEnvironment / clearEnvironment
const battleState = { environment: { id: 'normal', remaining: 0 }, roundNumber: 1, units: {} };
const setResult = WX.setEnvironment(battleState, 'blizzard', 4, 'caster_1');
assert('setEnvironment returns def', !!setResult);
assertEq('setEnvironment writes id', battleState.environment.id, 'blizzard');
assertEq('setEnvironment writes duration', battleState.environment.remaining, 4);
WX.clearEnvironment(battleState);
assertEq('clearEnvironment reverts to normal', battleState.environment.id, 'normal');
assertEq('clearEnvironment zeros duration', battleState.environment.remaining, 0);

// tickEnvironment with periodic tick
const ticker = {
  environment: { id: 'blizzard', remaining: 2 },
  roundNumber: 1,
  units: {
    u1: { instanceId: 'u1', team: 'player', currentHP: 50, maxHP: 50 },
    u2: { instanceId: 'u2', team: 'enemy',  currentHP: 50, maxHP: 50 }
  }
};
WX.tickEnvironment(ticker);
assert('Blizzard tick reduces player HP', ticker.units.u1.currentHP < 50);
assert('Blizzard tick reduces enemy HP',  ticker.units.u2.currentHP < 50);
assertEq('Duration decrements after tick', ticker.environment.remaining, 1);
WX.tickEnvironment(ticker);
assertEq('Weather reverts to normal at 0', ticker.environment.id, 'normal');

// Immune tag: water_native units skip rain immunity tagging
const stateRain = { environment: { id: 'rain' }, units: {
  immune: { type: 'water_native', accuracyBonus: 0 },
  normalU: { type: 'humanoid', accuracyBonus: 0 }
}};
WX.applyStatModsToUnit(stateRain.units.immune, stateRain);
WX.applyStatModsToUnit(stateRain.units.normalU, stateRain);
assertEq('Immune unit unchanged', stateRain.units.immune.accuracyBonus, 0);
assertEq('Non-immune unit modified', stateRain.units.normalU.accuracyBonus, -3);

// ────────────────────────────────────────────────────────────────────
// TEST 25: Ultimate meter
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 25: Ultimate meter ──');

// stat-compiler integration
DS.replace('characters', 'ulthero', {
  id: 'ulthero', name: 'Ult Hero', type: 'humanoid', rank: 'A',
  stats: { S: 8, P: 6, E: 7, C: 6, I: 5, A: 6, L: 5 },
  skills: ['basic_attack'],
  ultimateMax: 100, ultimateSkillId: 'ult_negate_damage'
});
const heroBase = DS.get('characters', 'ulthero');
const compiledHero = SC.compileUnit(heroBase, 'ulthero_1', {});
assertEq('Compiled unit has ultimateMeter', compiledHero.ultimateMeter, 0);
assertEq('Compiled unit has ultimateMax', compiledHero.ultimateMax, 100);
assertEq('Compiled unit has ultimateSkillId', compiledHero.ultimateSkillId, 'ult_negate_damage');
assert('Compiled unit includes ultimate skill in action pool',
  compiledHero.skills.some((entry) => (typeof entry === 'string' ? entry : entry.skillId) === 'ult_negate_damage'));
const compiledNoUlt = SC.compileUnit({
  id: 'plain_unit', name: 'Plain Unit', type: 'humanoid', rank: 'F',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  skills: []
}, 'plain_unit_1', {});
assertEq('Unit without ultimate skill has no ultimate meter', compiledNoUlt.ultimateMeter, null);

// grantUltimate / consumeUltimate
DC.grantUltimate(compiledHero, 30);
assertEq('grantUltimate adds to meter', compiledHero.ultimateMeter, 30);
DC.grantUltimate(compiledHero, 150);  // overfill clamps
assertEq('grantUltimate clamps to max', compiledHero.ultimateMeter, 100);
const drained = DC.consumeUltimate(compiledHero, 100);
assertEq('consumeUltimate drains meter', compiledHero.ultimateMeter, 0);
assertEq('consumeUltimate returns true on success', drained, true);
const drainFail = DC.consumeUltimate(compiledHero, 50);
assertEq('consumeUltimate returns false when not enough', drainFail, false);

// applyDamage credits both sides
const attacker = SC.compileUnit({
  id: 'a', name: 'Atk', type: 'humanoid', rank: 'F',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  ultimateSkillId: 'ult_reroll'
}, 'a', {});
const defender = SC.compileUnit({
  id: 'd', name: 'Def', type: 'humanoid', rank: 'F',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
  ultimateSkillId: 'ult_negate_damage'
}, 'd', {});
const before = { atk: attacker.ultimateMeter, def: defender.ultimateMeter };
DC.applyDamage({ attacker, target: defender, amount: 20, element: 'Physical', damageType: 'Physical' });
assert('Attacker meter grew', attacker.ultimateMeter > before.atk);
assert('Defender meter grew', defender.ultimateMeter > before.def);
const expectedAtk = 20 * 0.10; // 10% of dmg dealt
const expectedDef = 20 * 0.05; // 5% of dmg taken
assertNear('Attacker gains ~10% of damage', attacker.ultimateMeter, expectedAtk, 0.01);
assertNear('Defender gains ~5% of damage', defender.ultimateMeter, expectedDef, 0.01);

// KO bonus
defender.currentHP = 1;
attacker.ultimateMeter = 0;
DC.applyDamage({ attacker, target: defender, amount: 100, element: 'Physical', damageType: 'Physical' });
assert('Attacker gets ~25 KO bonus', attacker.ultimateMeter >= 25);

// negate_next_damage hack: flag zeroes incoming damage and is consumed
const aegis = SC.compileUnit({
  id: 'ag', name: 'Aegis', type: 'humanoid', rank: 'F',
  stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 }
}, 'ag', {});
aegis.currentHP = 50;
aegis.nextDamageNegated = true;
const negResult = DC.applyDamage({ attacker: null, target: aegis, amount: 99, element: 'Physical', damageType: 'Physical' });
assertEq('Negate ultimate zeroes damage applied', negResult.applied, 0);
assertEq('Negate ultimate keeps HP intact', aegis.currentHP, 50);
assertEq('Flag cleared after consumption', aegis.nextDamageNegated, false);

// ────────────────────────────────────────────────────────────────────
// TEST 26: Relationship tiers and condition gating
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 26: Relationship tiers ──');

const RT = CJS.RelationshipTiers;
assert('RelationshipTiers loaded', !!RT);

// Tier computation
assertEq('Empty bond is stranger', RT.computeTier({}).id, 'stranger');
assertEq('Score 12 → acquaintance', RT.computeTier({ trust: 12 }).id, 'acquaintance');
assertEq('Score 30 → friend', RT.computeTier({ trust: 20, friendship: 10 }).id, 'friend');
assertEq('Score 60 → close', RT.computeTier({ trust: 30, friendship: 30 }).id, 'close');
assertEq('Score 80 → bonded', RT.computeTier({ trust: 50, friendship: 30 }).id, 'bonded');
assertEq('High rivalry → rival', RT.computeTier({ rivalry: 40, trust: 5 }).id, 'rival');
// score = 30 - 10 = 20 → acquaintance tier (rivalry too low to flip to rival)
assertEq('Low rivalry with high trust → not rival', RT.computeTier({ rivalry: 10, trust: 30 }).id, 'acquaintance');

// meetsTier
assert('Friend meets stranger',     RT.meetsTier({ trust: 30 }, 'stranger'));
assert('Friend meets friend',       RT.meetsTier({ trust: 30 }, 'friend'));
assert('Friend does not meet bonded', !RT.meetsTier({ trust: 30 }, 'bonded'));
assert('Bonded meets close',        RT.meetsTier({ trust: 80 }, 'close'));
assert('Rival meets rival',         RT.meetsTier({ rivalry: 50 }, 'rival'));
assert('Friend does NOT meet rival', !RT.meetsTier({ trust: 30 }, 'rival'));

// Condition evaluator (bondMin with tier + op)
const Cond = CJS.CampaignConditions;
assert('CampaignConditions loaded', !!Cond);
const bondState = { bonds: { tessa: { trust: 30, friendship: 5 } } };

// Numeric op
const ok1 = Cond.evaluate({ bondMin: [{ npcId: 'tessa', field: 'trust', value: 20 }] }, bondState);
assert('bondMin numeric ≥ passes', ok1.ok);
const ok2 = Cond.evaluate({ bondMin: [{ npcId: 'tessa', field: 'trust', value: 50 }] }, bondState);
assert('bondMin numeric ≥ fails when below', !ok2.ok);
const ok3 = Cond.evaluate({ bondMin: [{ npcId: 'tessa', field: 'trust', value: 20, op: '<' }] }, bondState);
assert('bondMin op="<" works', !ok3.ok);
const ok4 = Cond.evaluate({ bondMin: [{ npcId: 'tessa', field: 'trust', value: 30, op: '==' }] }, bondState);
assert('bondMin op="==" works', ok4.ok);

// Tier shortcut
const tierOk = Cond.evaluate({ bondMin: [{ npcId: 'tessa', tierMin: 'friend' }] }, bondState);
assert('tierMin friend passes (score 35)', tierOk.ok);
const tierFail = Cond.evaluate({ bondMin: [{ npcId: 'tessa', tierMin: 'bonded' }] }, bondState);
assert('tierMin bonded fails', !tierFail.ok);

// relationship_set op
const csState = { bonds: { ria: { trust: 5 } }, log: [] };
const opsResult = CJS.CampaignOps;
if (opsResult && opsResult.apply) {
  // Hack: feed _applyOne via apply by stubbing the state retrieval
  // Easier: just call the function directly through the registered op switch
  // by going via a state-mutation that exposes it.
  // Since campaign-ops.apply consumes the state singleton, mutate the state and route.
  CJS.CampaignState.mutate((s) => { s.bonds = { ria: { trust: 5 } }; });
  CJS.CampaignOps.apply({ op: 'relationship_set', npcId: 'ria', field: 'trust', value: 42 }, { source: 'test' });
  const ria = CJS.CampaignState.getState().bonds?.ria;
  assertEq('relationship_set writes absolute value', ria.trust, 42);
}

// ────────────────────────────────────────────────────────────────────
// TEST 27: Weather damage multiplier flows through computeAttack
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 27: Weather × damage pipeline ──');

DS.reset();
DS.replace('weathers', 'normal', { id: 'normal', damageMods: {} });
DS.replace('weathers', 'rain', { id: 'rain', damageMods: { Water: 2.0, Fire: 0.5 } });

const A = SC.compileUnit({
  id: 'A', name: 'A', type: 'humanoid', rank: 'F',
  stats: { S: 10, P: 5, E: 5, C: 5, I: 5, A: 0, L: 0 },
  skills: ['basic_attack']
}, 'A', {});
const B = SC.compileUnit({
  id: 'B', name: 'B', type: 'humanoid', rank: 'F',
  stats: { S: 5, P: 5, E: 10, C: 5, I: 5, A: 0, L: 0 }
}, 'B', {});
const waterSkill = { id: 'w', power: 20, element: 'Water', damageType: 'Magic', scalingStat: 'I', unavoidable: true, dice: '1d1' };

// No weather: capture a reference damage
const refResult = DC.computeAttack({ attacker: A, target: B, skill: waterSkill, qteMultiplier: 1.0 });
const refDmg = refResult.damage;
assert('Reference damage > 0', refDmg > 0);

// With rain (CombatManager exposes the env to damage-calc)
CJS.CombatManager._testSetEnvironment = function(env) {
  // No-op stub — combat manager doesn't have a real test seam.
};
// Direct injection via patching getEnvironment for the test
const realGetEnv = CJS.CombatManager.getEnvironment;
CJS.CombatManager.getEnvironment = () => ({ id: 'rain', remaining: 3 });
const wetResult = DC.computeAttack({ attacker: A, target: B, skill: waterSkill, qteMultiplier: 1.0 });
CJS.CombatManager.getEnvironment = realGetEnv;
assert('Rain boosts water damage in pipeline', wetResult.damage > refDmg);
assertEq('Weather mult surfaced in breakdown', wetResult.breakdown.weatherMultiplier, 2.0);


// ────────────────────────────────────────────────────────────────────
// TEST 28: Relationship activities + per-phase act budget
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 28: Relationship activities ──');

DS.reset();
DS.replace('characters', 'tessa', { id: 'tessa', name: 'Tessa', stats: { S:5,P:5,E:5,C:5,I:5,A:5,L:5 } });
DS.replace('characters', 'ria',   { id: 'ria',   name: 'Ria',   stats: { S:5,P:5,E:5,C:5,I:5,A:5,L:5 } });

const CSt = CJS.CampaignState;
const Ops = CJS.CampaignOps;
assert('CampaignState loaded', !!CSt);
assert('CampaignOps loaded',   !!Ops);

CSt.mutate((s) => {
  s.bonds = { tessa: {}, ria: { rivalry: 5 } };
  s.relationshipActs = { remaining: 3, max: 3, lastResetPhase: 1, history: [] };
  s.phase = { number: 1, type: 'town_phase', name: 'Town Phase' };
});

// Hang out: +1 trust to Tessa, consumes one act
Ops.apply({ op: 'relationship_activity', characterId: 'tessa', activityId: 'hang_out' }, { source: 'test' });
let after = CSt.getState();
assertEq('Hang out adds +1 trust', after.bonds.tessa.trust, 1);
assertEq('Hang out consumes one act', after.relationshipActs.remaining, 2);
assertEq('Hang out records history', after.relationshipActs.history.length, 1);
assertEq('History records correct activity', after.relationshipActs.history[0].activityId, 'hang_out');

// Train: +1 respect
Ops.apply({ op: 'relationship_activity', characterId: 'tessa', activityId: 'train' }, { source: 'test' });
after = CSt.getState();
assertEq('Train adds +1 respect', after.bonds.tessa.respect, 1);

// Legacy Listen still works, mapped into trust by the simplified model
Ops.apply({ op: 'relationship_activity', characterId: 'tessa', activityId: 'listen' }, { source: 'test' });
after = CSt.getState();
assertEq('Listen adds +1 trust', after.bonds.tessa.trust, 2);
assertEq('Acts drained to 0', after.relationshipActs.remaining, 0);

// Compete with someone else — should be blocked (no acts left)
Ops.apply({ op: 'relationship_activity', characterId: 'ria', activityId: 'compete' }, { source: 'test' });
after = CSt.getState();
assertEq('Compete blocked when no acts', after.bonds.ria.rivalry, 5);

// Free activity bypasses the act budget (story-driven flows)
Ops.apply({ op: 'relationship_activity', characterId: 'ria', activityId: 'compete', free: true }, { source: 'test' });
after = CSt.getState();
assertEq('Free compete still goes through', after.bonds.ria.rivalry, 6);
assertEq('Free compete does not consume acts', after.relationshipActs.remaining, 0);

// Pass phase — should reset the acts and bump phase
Ops.apply({ op: 'pass_phase' }, { source: 'test' });
after = CSt.getState();
assertEq('passPhase refreshes acts to max', after.relationshipActs.remaining, 3);
assert('passPhase advances phase number', after.phase.number >= 2);
assertEq('passPhase records lastResetPhase', after.relationshipActs.lastResetPhase, after.phase.number);

// Explicit reset op
Ops.apply({ op: 'relationship_acts_reset', value: 5 }, { source: 'test' });
after = CSt.getState();
assertEq('relationship_acts_reset sets max', after.relationshipActs.max, 5);
assertEq('relationship_acts_reset refills', after.relationshipActs.remaining, 5);

// Unknown activity is silently logged
const beforeLogLen = CSt.getState().log.length;
Ops.apply({ op: 'relationship_activity', characterId: 'tessa', activityId: 'meditate_with' }, { source: 'test' });
after = CSt.getState();
assertEq('Unknown activity does not change bond', after.bonds.tessa.trust, 2);
assert('Unknown activity is logged', after.log.length > beforeLogLen);

// ────────────────────────────────────────────────────────────────────
// TEST 29: RelationshipTiers alias + getKnownCharacters
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 29: getKnownCharacters / alias ──');
const RT2 = CJS.RelationshipTiers;
assert('getKnownCharacters exists', typeof RT2.getKnownCharacters === 'function');
assert('getKnownNpcs alias still works', typeof RT2.getKnownNpcs === 'function');
const known = RT2.getKnownCharacters({ bonds: { a: {}, b: {} } });
assertEq('getKnownCharacters returns ids', known.length, 2);
const knownAlias = RT2.getKnownNpcs({ bonds: { a: {}, b: {} } });
assertEq('getKnownNpcs returns ids (alias)', knownAlias.length, 2);

// ────────────────────────────────────────────────────────────────────
// TEST 30: Weather skills & content load
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 30: Weather content sanity ──');

// Use direct registration via the data-store since file-load needs a real fetch.
// What matters is that our skill/effect ids parse and reference real effects.
const fs2 = require('fs');
const path2 = require('path');
function _readEntries(rel) {
  const raw = JSON.parse(fs2.readFileSync(path2.join(__dirname, rel), 'utf8'));
  return raw.entries || raw.effects || raw;
}
const masterEffects = JSON.parse(fs2.readFileSync(path2.join(__dirname, 'data/system/master-effects.json'), 'utf8')).effects;
const weatherSkills = _readEntries('data/universal/weather_skills.json');
const weatherPassives = _readEntries('data/universal/weather_passives.json');
const weathersFile = _readEntries('data/universal/weathers.json');

assert('weather_skills.json has Stormcaller', weatherSkills.some(s => s.id === 'stormcaller'));
assert('weather_skills.json has Sunbreak',     weatherSkills.some(s => s.id === 'sunbreak'));
assert('weather_skills.json has Eye of the Storm', weatherSkills.some(s => s.id === 'eye_of_the_storm'));
assert('weather_skills.json has Calm the Winds',   weatherSkills.some(s => s.id === 'calm_winds'));
assert('weather_skills.json has Storm Surge self', weatherSkills.some(s => s.id === 'storm_surge_self'));
assert('weather_passives.json has Weatherwise',    weatherPassives.some(p => p.id === 'weatherwise'));
assert('weather_passives.json has Stormborn',      weatherPassives.some(p => p.id === 'stormborn'));

// Each skill's effect refs must resolve in master-effects.json
for (const skill of weatherSkills) {
  for (const ref of (skill.effects || [])) {
    assert(`Skill ${skill.id}: effect ${ref.effectId} exists in master-effects`,
      !!masterEffects[ref.effectId]);
  }
}

// Master effects we added
assert('summon_rain master effect exists',    !!masterEffects.summon_rain);
assert('summon_sunny master effect exists',   !!masterEffects.summon_sunny);
assert('summon_blizzard master effect exists',!!masterEffects.summon_blizzard);
assert('clear_weather master effect exists',  !!masterEffects.clear_weather);
assert('storm_surge_apply master effect exists', !!masterEffects.storm_surge_apply);
assertEq('summon_rain action is environment_set', masterEffects.summon_rain.action, 'environment_set');
assertEq('summon_rain weatherId is rain',         masterEffects.summon_rain.weatherId, 'rain');

// Weather refs from skills point at real weather defs
const weatherIds = new Set(weathersFile.map(w => w.id));
const skillWeatherTargets = [
  ['stormcaller', 'rain'],
  ['sunbreak', 'sunny'],
  ['eye_of_the_storm', 'blizzard']
];
for (const [skillId, weatherId] of skillWeatherTargets) {
  const skill = weatherSkills.find(s => s.id === skillId);
  const ref = skill.effects.find(e => masterEffects[e.effectId]?.action === 'environment_set');
  const targetWeather = ref?.overrides?.weatherId || masterEffects[ref?.effectId]?.weatherId;
  assertEq(`${skillId} targets ${weatherId}`, targetWeather, weatherId);
  assert(`${weatherId} weather is registered`, weatherIds.has(weatherId));
}

DS.reset();
DS.replace('weathers', 'wth_test_weather', { id: 'wth_test_weather', name: 'Test Weather' });
assertEq('DataStore counts weathers', DS.getCounts().weathers, 1);
assert('DataStore export includes weathers', !!JSON.parse(DS.exportJSON()).weathers.wth_test_weather);
DS.reset();
DS.loadData({ weathers: { wth_loaded_weather: { id: 'wth_loaded_weather', name: 'Loaded Weather' } } });
assert('DataStore loadData imports weathers', !!DS.get('weathers', 'wth_loaded_weather'));

// ────────────────────────────────────────────────────────────────────
// TEST 31: ContentManager TYPE_TO_CATEGORY includes weathers
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 31: ContentManager category mapping ──');
const cmCode = fs2.readFileSync(path2.join(__dirname, 'js/core/content-manager.js'), 'utf8');
assert('TYPE_TO_CATEGORY includes weathers', /weathers:\s*['"]weathers['"]/.test(cmCode));
assert('TYPE_ORDER lists weathers', /'weathers'/.test(cmCode));

// ────────────────────────────────────────────────────────────────────
// TEST 32: Adventurer rank ladder helpers (Formulas)
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 32: Rank ladder helpers ──');
assertEq('rankIndex F is 0', F.rankIndex('F'), 0);
assertEq('rankIndex SSR is 8', F.rankIndex('SSR'), 8);
assertEq('nextRank F → E', F.nextRank('F'), 'E');
assertEq('nextRank SSR → null (max)', F.nextRank('SSR'), null);
assert('meetsRank: A meets B', F.meetsRank('A', 'B'));
assert('meetsRank: C meets C', F.meetsRank('C', 'C'));
assert('meetsRank: D does not meet B', !F.meetsRank('D', 'B'));
assert('meetsRank: empty target is unrestricted', F.meetsRank('F', null));
assertEq('minRank(A, S) is A', F.minRank('A', 'S'), 'A');
assertEq('effectiveRank caps SSR to S ceiling', F.effectiveRank('SSR', 'S'), 'S');
assertEq('effectiveRank passes through under ceiling', F.effectiveRank('E', 'S'), 'E');

// ────────────────────────────────────────────────────────────────────
// TEST 33: RP gain tapers with world ceiling
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 33: RP gain world-ceiling taper ──');
// No ceiling → full award.
assertEq('RP base 100 no ceiling', F.calcRpGain({ sourceRank: 'C', memberRank: 'C', base: 100 }), 100);
// Far below ceiling (gap >= 2) → full award.
assertEq('RP gap >= 2 full', F.calcRpGain({ sourceRank: 'C', memberRank: 'C', worldCeiling: 'S', base: 100 }), 100);
// gap === 1 → 75%
assertEq('RP gap == 1 → 75%', F.calcRpGain({ sourceRank: 'C', memberRank: 'B', worldCeiling: 'A', base: 100 }), 75);
// gap === 0 → 50%
assertEq('RP at ceiling → 50%', F.calcRpGain({ sourceRank: 'C', memberRank: 'A', worldCeiling: 'A', base: 100 }), 50);
// gap === -1 → 25%
assertEq('RP one above ceiling → 25%', F.calcRpGain({ sourceRank: 'C', memberRank: 'S', worldCeiling: 'A', base: 100 }), 25);
// gap <= -2 → 0
assertEq('RP two above ceiling → 0', F.calcRpGain({ sourceRank: 'C', memberRank: 'SR', worldCeiling: 'A', base: 100 }), 0);
// levelScale applies before the taper.
assertEq('RP scales with levelScale at full mult', F.calcRpGain({ sourceRank: 'C', memberRank: 'F', worldCeiling: 'S', base: 10, levelScale: 2 }), 20);

// ────────────────────────────────────────────────────────────────────
// TEST 34: Monster level scaling and band clamp
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 34: Monster level scaling ──');
assertEq('calcMonsterLevelScale(1) = 1.0', F.calcMonsterLevelScale(1), 1);
assertNear('calcMonsterLevelScale(10) ~= 1.54', F.calcMonsterLevelScale(10), 1.54, 0.001);
const monster = { rank: 'E', levelBand: { min: 1, max: 8 } };
const lowLevel = F.pickMonsterLevel(monster, { partyAvgLevel: 1, danger: 0, worldCeiling: 'S' });
assert('pickMonsterLevel respects band min for new party', lowLevel >= 1 && lowLevel <= 8);
const cappedByWorld = F.pickMonsterLevel({ rank: 'E', levelBand: { min: 1, max: 30 } }, { partyAvgLevel: 30, danger: 10, worldCeiling: 'F' });
const fBand = (CJS.CONST.MONSTER_LEVEL_SCALING.levelBandByRank.F || {});
assert('pickMonsterLevel clamps to world ceiling rank band',
  cappedByWorld <= (fBand.max || 4));

// ────────────────────────────────────────────────────────────────────
// TEST 35: compileUnit level scaling + tier grants
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 35: compileUnit honours opts.level ──');
DS.reset();
DS.replace('skills', 'tier_skill_a', { id: 'tier_skill_a', name: 'Tier Skill A' });
DS.replace('skills', 'base_skill', { id: 'base_skill', name: 'Base Skill' });
DS.replace('monsters', 'lvl_wolf', {
  id: 'lvl_wolf', name: 'Test Wolf', rank: 'F', team: 'enemy',
  stats: { S: 8, P: 5, E: 8, C: 2, I: 2, A: 6, L: 3 },
  skills: ['base_skill'],
  levelBand: { min: 1, max: 10 },
  levelTiers: [{ level: 5, grantsSkills: ['tier_skill_a'] }]
});
const wolfBase = DS.get('monsters', 'lvl_wolf');
const compiled1 = CJS.StatCompiler.compileUnit(wolfBase, 'inst1', { level: 1 });
const compiled10 = CJS.StatCompiler.compileUnit(wolfBase, 'inst10', { level: 10 });
assertEq('compileUnit level 1 has level=1', compiled1.level, 1);
assertEq('compileUnit level 10 has level=10', compiled10.level, 10);
assert('compileUnit level 10 has more HP than level 1', compiled10.maxHP > compiled1.maxHP);
assertNear('HP scales ~1.54× at level 10',
  compiled10.maxHP / compiled1.maxHP, 1.54, 0.25);
// Tier skill not present at level 1, present at level 10.
function hasSkill(c, sid) {
  return (c.skills || []).some((s) => (typeof s === 'string' ? s : s?.skillId) === sid);
}
assert('Level 1: no tier skill', !hasSkill(compiled1, 'tier_skill_a'));
assert('Level 10: tier skill granted', hasSkill(compiled10, 'tier_skill_a'));

// ────────────────────────────────────────────────────────────────────
// TEST 36: Rank-up ops + world-ceiling gate
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 36: Rank ops ──');
DS.reset();
DS.replace('worlds', 'haven', { id: 'haven', displayName: 'Haven', ceiling: 'S' });
DS.replace('worlds', 'low_world', { id: 'low_world', displayName: 'Low World', ceiling: 'D' });
DS.replace('worlds', 'sr_world', { id: 'sr_world', displayName: 'SR World', ceiling: 'SR', requiredRank: 'SR' });
DS.replace('characters', 'tester', {
  id: 'tester', name: 'Tester', rank: 'F', team: 'player',
  stats: { S: 8, P: 5, E: 8, C: 5, I: 5, A: 6, L: 3 }
});

const CST = CJS.CampaignState;
const OpsT = CJS.CampaignOps;

// Build a minimal state with a single party member.
CST.setState({
  campaignId: 'test', saveId: 'save_test', saveVersion: 1,
  currentWorld: 'haven', currentChapter: 1,
  phase: { number: 1, type: 'town_phase', name: 'Town' },
  currencies: {}, inventory: { items: {}, materials: {}, food: {}, questItems: {}, equipment: {} },
  party: {}, quests: {}, flags: {}, log: [], worldArchive: {}, sideContent: {},
  storyDirector: {}, storyMode: {}, relationshipActs: { remaining: 3, max: 3 }, mapState: {},
  hubState: {}, eventCharges: {}, scenarioHistory: [], legacy: { traits: {}, majorChoices: [], unlockedEchoes: [] },
  tagLedger: { entries: {} }, questPulse: { recent: [], settings: { autoApplyCombat: true } },
  clocks: {}, memoryShards: {}, bonds: {}, pinnedNotes: [], settings: {},
  activeScenarioRun: null
}, { source: 'test', type: 'replace' });

OpsT.apply({ op: 'recruit_character', characterId: 'tester' }, { source: 'test' });
let rankTestState = CST.getState();
const memberId = 'tester';
let rankTestMember = rankTestState.party[memberId];
assert('Member has adventurer ledger', !!rankTestMember?.adventurer);
assertEq('Initial adventurer rank is F', rankTestMember.adventurer.rank, 'F');
assertEq('Initial RP is 0', rankTestMember.adventurer.rankPoints, 0);

// Add RP — should accumulate.
OpsT.apply({ op: 'add_rank_points', target: memberId, amount: 30, sourceRank: 'F' }, { source: 'test' });
rankTestState = CST.getState();
rankTestMember = rankTestState.party[memberId];
assert('RP accumulated after add_rank_points', rankTestMember.adventurer.rankPoints > 0);

// Force rank up to E (force bypasses gates).
OpsT.apply({ op: 'rank_up_member', target: memberId, toRank: 'E', force: true }, { source: 'test' });
rankTestState = CST.getState();
rankTestMember = rankTestState.party[memberId];
assertEq('Member rank promoted to E', rankTestMember.adventurer.rank, 'E');
assertEq('Member.rank mirror updated', rankTestMember.rank, 'E');

// World transition: hard gate denies travel to SR-required world from F/E party.
const beforeWorld = CST.getState().currentWorld;
OpsT.apply({ op: 'world_transition', toWorld: 'sr_world' }, { source: 'test' });
assertEq('World transition denied without required rank', CST.getState().currentWorld, beforeWorld);

// Promote to SR and try again.
OpsT.apply({ op: 'rank_up_member', target: memberId, toRank: 'SR', force: true }, { source: 'test' });
OpsT.apply({ op: 'world_transition', toWorld: 'sr_world' }, { source: 'test' });
assertEq('World transition allowed with required rank', CST.getState().currentWorld, 'sr_world');

// Capture state before low_world push (member is at SR with however much RP).
const rpBeforeLowWorld = CST.getState().party[memberId].adventurer.rankPoints;

// In low_world (ceiling D), promotion past D is blocked (member is SR).
OpsT.apply({ op: 'world_transition', toWorld: 'low_world', bypassRankGate: true }, { source: 'test' });
OpsT.apply({ op: 'rank_up_member', target: memberId, toRank: 'SSR' }, { source: 'test' });
rankTestState = CST.getState();
// Without force, SSR promotion in D-ceiling world should be blocked.
assertEq('Promotion past world ceiling blocked', rankTestState.party[memberId].adventurer.rank, 'SR');

// RP in a low-ceiling world should taper to 0 for an SR member.
OpsT.apply({ op: 'add_rank_points', target: memberId, amount: 1000, sourceRank: 'C' }, { source: 'test' });
rankTestState = CST.getState();
const rpAfterTaper = rankTestState.party[memberId].adventurer.rankPoints;
assertEq('RP awards taper to 0 above world ceiling', rpAfterTaper, rpBeforeLowWorld);

// ────────────────────────────────────────────────────────────────────
// TEST 37: Conditions worldMinRank / memberRankMin
// ────────────────────────────────────────────────────────────────────
console.log('\n── TEST 37: Rank conditions ──');
const RankConditions = CJS.CampaignConditions;
const stateForCond = CST.getState();
const passingWorld = RankConditions.evaluate({ worldMinRank: 'F' }, stateForCond);
assert('worldMinRank F passes in any world', passingWorld.ok);
const failingWorld = RankConditions.evaluate({ worldMinRank: 'SSR' }, stateForCond);
assert('worldMinRank SSR fails in D-ceiling world', !failingWorld.ok);
const passingMember = RankConditions.evaluate({ memberRankMin: 'E' }, stateForCond);
assert('memberRankMin E passes with SR member', passingMember.ok);
const failingMember = RankConditions.evaluate({ memberRankMin: 'SSR' }, stateForCond);
assert('memberRankMin SSR fails without SSR member', !failingMember.ok);

// ══════════════════════════════════════════════════════════════════════
// TEST 38: Flanking math (formulas.getFlankPosition)
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 38: Flanking math ──');
{
  const F = CJS.Formulas;
  // Target faces N → attacker at S of target = REAR (full crit bonus)
  const rear = F.getFlankPosition([3, 1], [1, 1], 'N');
  assertEq('attacker due south of N-facing target = rear', rear.position, 'rear');
  assert('rear position grants crit bonus', rear.critBonus > 0);

  // Same target, attacker due N → FRONT (no bonus)
  const front = F.getFlankPosition([-1, 1], [1, 1], 'N');
  assertEq('attacker due north of N-facing target = front', front.position, 'front');
  assertEq('front position grants no crit bonus', front.critBonus, 0);

  // Attacker to the side → SIDE arc (default = no bonus, only labelled)
  const side = F.getFlankPosition([1, 4], [1, 1], 'N');
  assertEq('attacker due east of N-facing target = side', side.position, 'side');
  assertEq('side bonus is 0 by default (only rear is bonused)', side.critBonus, 0);
  assert('rear bonus is strictly larger than side', rear.critBonus > side.critBonus);

  // Diagonal facing — target faces NE, attacker is at SW = rear
  const rearDiag = F.getFlankPosition([3, -1], [1, 1], 'NE');
  assertEq('diagonal facing handles diagonal rear', rearDiag.position, 'rear');

  // No facing → always front, no bonus
  const noFacing = F.getFlankPosition([3, 1], [1, 1], null);
  assertEq('null facing returns front', noFacing.position, 'front');
  assertEq('null facing grants 0 bonus', noFacing.critBonus, 0);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 39: Elevation math (formulas.calcElevationBonuses)
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 39: Elevation math ──');
{
  const F = CJS.Formulas;

  // Equal elevation → no bonus
  const flat = F.calcElevationBonuses(0, 0, 1);
  assertEq('equal elevation = no accuracy bonus', flat.accuracy, 0);
  assertEq('equal elevation = no range bonus', flat.range, 0);

  // High ground melee → accuracy bonus only
  const hgMelee = F.calcElevationBonuses(1, 0, 1);
  assert('high ground melee grants accuracy', hgMelee.accuracy > 0);
  assertEq('high ground melee grants NO range bonus', hgMelee.range, 0);

  // High ground ranged → both bonuses
  const hgRanged = F.calcElevationBonuses(1, 0, 3);
  assert('high ground ranged grants accuracy', hgRanged.accuracy > 0);
  assert('high ground ranged grants range', hgRanged.range > 0);

  // Target on higher ground → no bonus
  const punchedUp = F.calcElevationBonuses(0, 1, 3);
  assertEq('attacking up at higher target = no bonus', punchedUp.accuracy, 0);
  assertEq('attacking up at higher target = no range bonus', punchedUp.range, 0);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 40: Facing-from-delta helper
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 40: facingFromDelta ──');
{
  const F = CJS.Formulas;
  assertEq('move south → S facing', F.facingFromDelta(1, 0), 'S');
  assertEq('move north → N facing', F.facingFromDelta(-1, 0), 'N');
  assertEq('move east  → E facing', F.facingFromDelta(0, 1), 'E');
  assertEq('move west  → W facing', F.facingFromDelta(0, -1), 'W');
  assertEq('move SE diagonal',     F.facingFromDelta(2, 3), 'SE');
  assertEq('zero delta → null',    F.facingFromDelta(0, 0), null);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 41: New terrain types are registered
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 41: New terrain registration ──');
{
  const T = CJS.CONST.TERRAIN_TYPES;
  assert('grass terrain registered',   !!T.grass);
  assert('cliff terrain registered',   !!T.cliff);
  assert('barrel terrain registered',  !!T.barrel);
  assertEq('grass flammable',          T.grass.flammable, true);
  assertEq('water freezable',          T.water.freezable, true);
  assertEq('cliff lethal',             T.cliff.lethal, true);
  assertEq('cliff impassable',         T.cliff.passable, false);
  assertEq('barrel destructible',      T.barrel.destructible, true);
  assertEq('barrel impassable',        T.barrel.passable, false);
  assertEq('high_ground elevation=1',  T.high_ground.elevation, 1);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 42: Barrel explosion damage scaling
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 42: Barrel explosion damage ──');
{
  const F = CJS.Formulas;
  const baseDmg = F.calcBarrelExplosionDamage(0);
  const strongDmg = F.calcBarrelExplosionDamage(50);
  assert('barrel base damage > 0', baseDmg > 0);
  assert('STR scales barrel damage up', strongDmg > baseDmg);
  // Cap: damage should not exceed 2× base regardless of STR
  const insaneDmg = F.calcBarrelExplosionDamage(999);
  assert('barrel damage caps at 2× base', insaneDmg <= baseDmg * 2);
}

// ══════════════════════════════════════════════════════════════════════
// TEST 43: Grid engine env interactions (real grid-engine, no stub)
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 43: GridEngine env interactions ──');
{
  // Load the REAL grid engine for this section
  const gridEnginePath = path.join(__dirname, 'js', 'grid', 'grid-engine.js');
  const pfPath = path.join(__dirname, 'js', 'grid', 'pathfinding.js');
  const savedGE = CJS.GridEngine;
  const savedPF = CJS.Pathfinding;
  vm.runInContext(fs.readFileSync(pfPath, 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(gridEnginePath, 'utf8'), sandbox);
  const GE = CJS.GridEngine;
  assert('Real GridEngine loaded', typeof GE.igniteCell === 'function');

  // Build a 5×5 grid with grass, water, cliff, barrel scattered
  const grid = [
    ['empty', 'grass', 'empty', 'water', 'empty'],
    ['empty', 'grass', 'empty', 'water', 'empty'],
    ['empty', 'empty', 'empty', 'empty', 'cliff'],
    ['empty', 'empty', 'barrel','empty', 'empty'],
    ['empty', 'empty', 'empty', 'empty', 'empty']
  ];
  const fighter = {
    instanceId: 'fighter1', team: 'player', name: 'Fighter',
    stats: { S: 10, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
    compiledStats: { S: 10, P: 5, E: 0, C: 5, I: 5, A: 5, L: 5 },
    currentHP: 50, maxHP: 50, size: '1x1'
  };
  const target = {
    instanceId: 'target1', team: 'enemy', name: 'Target',
    stats: { S: 5, P: 5, E: 0, C: 5, I: 5, A: 5, L: 5 },
    compiledStats: { S: 5, P: 5, E: 0, C: 5, I: 5, A: 5, L: 5 },
    currentHP: 30, maxHP: 30, size: '1x1'
  };
  GE.init({
    width: 5, height: 5, grid,
    units: [
      { id: 'fighter1', pos: [2, 0] },
      { id: 'target1',  pos: [2, 3] }
    ]
  }, { fighter1: fighter, target1: target });

  // Igniting grass cell turns it to fire_zone
  const igR = GE.igniteCell(0, 1);
  assert('igniteCell converts grass to fire_zone', igR.changed.length > 0);
  assertEq('grass→fire_zone cell now reads fire_zone', GE.getTerrain(0, 1), 'fire_zone');
  // Spread to adjacent grass at (1,1)
  assertEq('adjacent grass also catches', GE.getTerrain(1, 1), 'fire_zone');

  // Freeze water at (0,3)
  const fzR = GE.freezeCell(0, 3);
  assert('freezeCell converts water to ice_zone', fzR.changed.length > 0);
  assertEq('water→ice_zone cell now reads ice_zone', GE.getTerrain(0, 3), 'ice_zone');

  // igniteCell on non-flammable terrain is a no-op
  const noop = GE.igniteCell(2, 0); // empty cell
  assertEq('non-flammable cell ignite = no-op', noop.changed.length, 0);

  // detonateBarrel returns hits + destroys the barrel
  const expl = GE.detonateBarrel(3, 2, 'fighter1');
  assert('barrel explosion succeeded', expl.exploded);
  assert('barrel turned to rubble',    GE.getTerrain(3, 2) === 'rubble');
  // Barrel is too far to catch our units in this setup, but explosion result
  // shape must be present.
  assert('explosion damage > 0', expl.damage > 0);
  assertEq('explosion element is Fire', expl.element, 'Fire');

  // Facing: moving updates facing
  GE.setFacing('fighter1', 'N');
  assertEq('setFacing stores N',  GE.getFacing('fighter1'), 'N');
  // Pass-through grass on the way south — should now read 'S' after a move
  const mv = GE.moveUnit('fighter1', 3, 0);
  assert('move succeeds', mv.success);
  assertEq('facing updated to S after south move', GE.getFacing('fighter1'), 'S');

  // Cliff knockback = instant kill
  // Place attacker so a single-cell knockback shoves the target into the cliff at (2,4)
  CJS.Formulas.calcKnockbackDistance = (d) => d; // bypass END resistance for this test
  target.pos = [2, 3];
  target.currentHP = 30;
  // Re-place via grid engine internal placement: knockback uses position
  const kbToCliff = GE.knockback('target1', 0, 1, 1);
  assert('knockback landed on cliff', kbToCliff.landedOnCliff);
  assert('collision marked as cliff', kbToCliff.collisions.some(c => c.type === 'cliff'));
  // Resolve via damage-calc applyKnockbackCollisions to trigger the kill
  CJS.DamageCalc.applyKnockbackCollisions({
    source: fighter, pushedUnit: target, kb: kbToCliff
  });
  assertEq('target killed by cliff fall', target.currentHP, 0);

  // Restore stubs so other tests keep working
  CJS.GridEngine = savedGE;
  CJS.Pathfinding = savedPF;
}

// ══════════════════════════════════════════════════════════════════════
// TEST 44: Flanking applies positional info during computeAttack
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 44: Flanking in computeAttack ──');
{
  // Build a minimal real GridEngine with two units so computeAttack can
  // resolve flanking via GE.getFlankPosition.
  const savedGE = CJS.GridEngine;
  const savedPF = CJS.Pathfinding;
  const gridEnginePath = path.join(__dirname, 'js', 'grid', 'grid-engine.js');
  const pfPath = path.join(__dirname, 'js', 'grid', 'pathfinding.js');
  vm.runInContext(fs.readFileSync(pfPath, 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(gridEnginePath, 'utf8'), sandbox);
  const GE = CJS.GridEngine;

  const baseStats = { S: 10, P: 8, E: 5, C: 5, I: 5, A: 5, L: 0 };
  const attacker = {
    instanceId: 'atk', team: 'player', name: 'Atk',
    stats: baseStats, compiledStats: baseStats, dr: { physical: 0, magic: 0, chaos: 0 },
    currentHP: 100, maxHP: 100, size: '1x1', basicAttackPower: 10, basicAttackRange: 1
  };
  const target = {
    instanceId: 'tgt', team: 'enemy', name: 'Tgt',
    stats: baseStats, compiledStats: baseStats, dr: { physical: 0, magic: 0, chaos: 0 },
    currentHP: 100, maxHP: 100, size: '1x1', facing: 'N'
  };
  GE.init({
    width: 4, height: 4, grid: [
      ['empty','empty','empty','empty'],
      ['empty','empty','empty','empty'],
      ['empty','empty','empty','empty'],
      ['empty','empty','empty','empty']
    ],
    units: [
      { id: 'atk', pos: [3, 1] }, // south of target — REAR
      { id: 'tgt', pos: [1, 1] }
    ]
  }, { atk: attacker, tgt: target });
  // After init: target faces 'N' (kept from authored), attacker is south = rear.
  target.facing = 'N';

  const flank = GE.getFlankPosition(attacker, target);
  assertEq('GE recognises rear position', flank.position, 'rear');
  assert('GE rear position grants crit bonus', flank.critBonus > 0);

  // computeAttack returns a positional block with flank info
  const res = CJS.DamageCalc.computeAttack({
    attacker, target, skill: null, qteMultiplier: 1.0
  });
  assert('computeAttack returns positional block', !!res.positional);
  assertEq('positional flank label matches GE', res.positional.flank, 'rear');
  assert('positional crit bonus passed through',  res.positional.critBonus > 0);

  CJS.GridEngine = savedGE;
  CJS.Pathfinding = savedPF;
}

// ══════════════════════════════════════════════════════════════════════
// TEST 45: Elevation bonus surfaces through getAttackRange + breakdown
// ══════════════════════════════════════════════════════════════════════
console.log('\n── TEST 45: Elevation in computeAttack & getAttackRange ──');
{
  const savedGE = CJS.GridEngine;
  const savedPF = CJS.Pathfinding;
  const gridEnginePath = path.join(__dirname, 'js', 'grid', 'grid-engine.js');
  const pfPath = path.join(__dirname, 'js', 'grid', 'pathfinding.js');
  vm.runInContext(fs.readFileSync(pfPath, 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(gridEnginePath, 'utf8'), sandbox);
  const GE = CJS.GridEngine;
  const AH = CJS.ActionHandler;

  const baseStats = { S: 10, P: 8, E: 5, C: 5, I: 5, A: 5, L: 0 };
  const archer = {
    instanceId: 'archer', team: 'player', name: 'Archer',
    stats: baseStats, compiledStats: baseStats, dr: { physical: 0, magic: 0, chaos: 0 },
    currentHP: 100, maxHP: 100, size: '1x1',
    basicAttackPower: 10, basicAttackRange: 3   // ranged so elevation matters
  };
  const target = {
    instanceId: 'tgt2', team: 'enemy', name: 'Tgt',
    stats: baseStats, compiledStats: baseStats, dr: { physical: 0, magic: 0, chaos: 0 },
    currentHP: 100, maxHP: 100, size: '1x1', facing: 'S'
  };
  GE.init({
    width: 4, height: 4, grid: [
      ['empty','empty','empty','empty'],
      ['empty','high_ground','empty','empty'],
      ['empty','empty','empty','empty'],
      ['empty','empty','empty','empty']
    ],
    units: [
      { id: 'archer', pos: [1, 1] }, // on high ground
      { id: 'tgt2',   pos: [2, 1] }
    ]
  }, { archer: archer, tgt2: target });

  const baseRange = AH.getAttackRange({ ...archer, equipment: [] });
  // 3 (base) + 1 (elevation step × 1) = 4
  assert('ranged attacker gets +range from high ground', baseRange >= 4);

  // Melee attacker (range 1) on high ground gets NO range bonus
  const melee = { ...archer, basicAttackRange: 1 };
  const meleeRange = AH.getAttackRange({ ...melee, equipment: [] });
  assertEq('melee gets no high-ground range bonus', meleeRange, 1);

  const res = CJS.DamageCalc.computeAttack({
    attacker: archer, target, skill: null, qteMultiplier: 1.0
  });
  assert('positional includes elevation step', res.positional.elevationStep >= 1);
  assert('positional includes accuracy bonus', res.positional.accuracyBonus > 0);

  CJS.GridEngine = savedGE;
  CJS.Pathfinding = savedPF;
}

// RESULTS
// ══════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log(`RESULTS: ${_passed} passed, ${_failed} failed`);
if (_failed > 0) {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
}
