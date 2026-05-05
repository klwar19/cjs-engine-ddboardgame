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
  'core/data-store.js',
  'core/skill-resolver.js',
  'effects/value-calc.js',
  'effects/conditions.js',
  'effects/effect-registry.js',
  'effects/effect-resolver.js',
  'combat/combat-log.js',
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
  'qte/qte-manager.js'
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

DS.replace('worlds', 'haven', { id: 'haven', name: 'Haven' });

assertEq('zone ID prefix', zoneId, 'zon_001');
assertEq('crop ID prefix', cropId, 'crp_001');
assertEq('shop ID prefix', shopId, 'shp_001');
assertEq('crafting ID prefix', recipeId, 'rcp_001');
assertEq('food ID prefix', foodId, 'fod_001');
assertEq('material ID prefix', materialId, 'mat_001');
assertEq('story ID prefix', storyId, 'sto_001');
assertEq('world count exposed', DS.getCounts().worlds, 1);
assertEq('zone count exposed', DS.getCounts().zones, 1);
assert('exportJSON includes future collections', (() => {
  const exported = JSON.parse(DS.exportJSON());
  return exported.worlds && exported.zones && exported.food && exported.materials && exported.crafting;
})());

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
const bowyCompiled = SC.compileUnit(DS.get('characters', 'bowy'), 'bowy_test');
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
  skillSlots: 4, passiveSlots: 3, skillPoints: 4, passivePoints: 3,
  equippedSkills: [sp1, sp2],
  equippedPassives: []
};
const baseFake = { stats: { S: 5 } };
assertEq('effective skill slots = base 4 (no level/rank/job/item bonuses)', F.calcEffectiveSkillSlots(memberWithPool, baseFake), 4);
assertEq('effective skill points = base 4', F.calcEffectiveSkillPoints(memberWithPool, baseFake), 4);
assertEq('current SP usage from 2x cost-1 = 2', F.calcEquippedSpCost([sp1, sp2], 'skills'), 2);
assertEq('SP cost of heavy skill = 3', F.calcSpCost(DS.get('skills', sp5)), 3);

// Per-level cadence: at level 5 we should gain +1 skill point per the
// PROGRESSION.skillPointsPerCharLevel cadence (every: 4, amount: 1).
memberWithPool.level = 5;
assertEq('level 5 grants +1 skill point (every-4 cadence)', F.calcEffectiveSkillPoints(memberWithPool, baseFake), 5);

// Rank E grants +1 skill point per CONST.PROGRESSION.rankSkillPointBonus.
memberWithPool.rank = 'E';
memberWithPool.level = 1;
assertEq('rank E grants +1 skill point baseline', F.calcEffectiveSkillPoints(memberWithPool, baseFake), 5);

DS.remove('skills', sp1);
DS.remove('skills', sp2);
DS.remove('skills', sp3);
DS.remove('skills', sp4);
DS.remove('skills', sp5);

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
