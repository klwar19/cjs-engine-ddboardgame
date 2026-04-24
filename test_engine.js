// test_engine.js — Regression test suite for CJS Combat Simulator
// Tests all repaired integration seams from the code review.
// Run: node test_engine.js
//
// Tests:
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

// Unit with ranged weapon
DS.replace('items', 'test_crossbow', {
  id: 'test_crossbow', name: 'Test Crossbow', slot: 'weapon',
  effects: [], weaponData: { baseDamage: 8, range: 4, damageType: 'Physical', element: 'Physical' }
});
const rangedUnit = { equipment: ['test_crossbow'], rangeBonus: 0 };
assertEq('crossbow → range 4', AH.getAttackRange(rangedUnit), 4);

// With rangeBonus
const bonusUnit = { equipment: ['test_crossbow'], rangeBonus: 2 };
assertEq('crossbow + rangeBonus 2 → range 6', AH.getAttackRange(bonusUnit), 6);

// Elemental weapon
DS.replace('items', 'test_frost_staff', {
  id: 'test_frost_staff', name: 'Frost Staff', slot: 'weapon',
  effects: [], weaponData: { baseDamage: 6, range: 3, damageType: 'Magic', element: 'Water' }
});
const mageUnit = { equipment: ['test_frost_staff'], rangeBonus: 0 };
assertEq('frost staff → range 3', AH.getAttackRange(mageUnit), 3);

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
