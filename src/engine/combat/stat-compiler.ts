// stat-compiler.ts — Tier 3 TS port of js/combat/stat-compiler.js (engine
// cluster: combat). Takes a raw character/monster + their skills/items/passives/
// statuses and produces a COMPILED UNIT: final stats, HP/MP/DR, movement, and a
// flat list of all effects. Called at combat start and on passive-affecting
// buff/debuff changes.
//
// Reads: window.CJS DataStore/Formulas/CONST/StatusManager/SkillResolver.
// Used by: combat-manager (startup), status-manager (on buff change).
//
// Exports the typed `StatCompiler: CJSStatCompiler` AND installs
// window.CJS.StatCompiler. Bodies verbatim; the compiled-unit object, the
// modifier accumulator, and the mid-combat opts bag are `any` (dynamic shapes).

const C  = () => window.CJS.CONST;
const F  = () => window.CJS.Formulas;
const DS = () => window.CJS.DataStore;
const SM = (): any => window.CJS.StatusManager;

// ── PASSIVE TRIGGER TYPES (modify stats BEFORE combat) ─────────────
const PASSIVE_TRIGGERS = new Set([
  'stat_mod', 'dr_mod', 'element_mod', 'crit_mod', 'evasion_mod',
  'accuracy_mod', 'ap_mod', 'movement_mod', 'range_mod', 'cost_mod',
  'cooldown_mod', 'damage_mod', 'hp_mod', 'mp_mod',
  'status_resist_mod', 'double_action', 'triple_action'
]);

// Maximum number of highest sources to keep for stat/damage caps
const STACKING_CAP = 5;

// ── MAIN: COMPILE A UNIT ───────────────────────────────────────────
function compileUnit(baseUnit, instanceId?, opts: any = {}) {
  if (!baseUnit) return null;
  const id = instanceId || baseUnit.id;

  // ── Resolve level scaling (defaults to baseUnit.level if authored, else 1).
  const level = Math.max(1, Number(opts.level ?? baseUnit.level ?? 1));
  const levelScale = (F().calcMonsterLevelScale ? F().calcMonsterLevelScale(level) : 1);
  const tierGrants = _collectLevelTierGrants(baseUnit, level);

  // ── 1. Gather all effect references ────────────────────────────
  const augmentedBaseUnit = tierGrants.passives.length
    ? { ...baseUnit, innatePassives: _mergeUnique(baseUnit.innatePassives || [], tierGrants.passives) }
    : baseUnit;
  const effectRefs = _gatherEffectRefs(augmentedBaseUnit, opts.activeStatuses || []);

  // ── 2. Resolve effects (merge master + overrides) ──────────────
  const effects = _resolveRefs(effectRefs);

  // ── 3. Start with base stats ────────────────────────────────────
  const baseStats = { ...(baseUnit.stats || { S:5, P:5, E:5, C:5, I:5, A:5, L:5 }) };

  // ── 4. Accumulate modifiers from all passive effects ───────────
  const mods = _collectModifiers(effects);

  // ── 5. Apply stat modifiers (with stacking cap) ────────────────
  const compiledStats = { ...baseStats };
  for (const stat of C().STATS) {
    compiledStats[stat] = Math.max(0, (compiledStats[stat] || 0) + (mods.stat[stat] || 0));
  }

  // Apply monster-level scaling to compiledStats so derived HP/MP/DR all scale
  // consistently. Skip at level 1 to keep original values untouched.
  if (levelScale > 1) {
    for (const stat of C().STATS) {
      compiledStats[stat] = Math.max(0, Math.round((compiledStats[stat] || 0) * levelScale));
    }
  }

  // ── 6. Calculate derived values ────────────────────────────────
  const rank = baseUnit.rank || 'F';
  let maxHP = F().calcMaxHP(compiledStats, rank, {
    team: baseUnit.team || 'enemy',
    type: baseUnit.type || 'humanoid',
    id: baseUnit.id
  }) + (mods.hpFlat || 0);
  maxHP = Math.floor(maxHP * (1 + (mods.hpPercent || 0) / 100));

  let maxMP = F().calcMaxMP(compiledStats, rank) + (mods.mpFlat || 0);
  maxMP = Math.floor(maxMP * (1 + (mods.mpPercent || 0) / 100));

  const drPhysical = F().calcPhysicalDR(compiledStats) + (mods.dr.physical || 0) + (mods.dr.all || 0);
  const drMagic    = F().calcMagicDR(compiledStats)    + (mods.dr.magic    || 0) + (mods.dr.all || 0);
  const drChaos    = F().calcChaosDR(compiledStats)    + (mods.dr.chaos    || 0) + (mods.dr.all || 0);

  const baseMovement = baseUnit.movement ?? C().MOVEMENT_DEFAULTS[baseUnit.type] ?? 3;
  const movement = F().calcMovement(baseMovement, mods.movement);

  const baseAP = C().ACTION_ECONOMY.baseAP + (mods.ap || 0);

  // ── 7. Element handling: merge base + passive modifiers ─────────
  const weak   = _mergeUnique(baseUnit.weak   || [], mods.element.weak);
  const resist = _mergeUnique(baseUnit.resist || [], mods.element.resist);
  const immune = _mergeUnique(baseUnit.immune || [], mods.element.immune);
  const ultimateSkillId = baseUnit.ultimateSkillId || null;
  const hasUltimate = !!ultimateSkillId;
  const ultimateMax = hasUltimate ? Math.max(1, Number(baseUnit.ultimateMax ?? 100) || 100) : null;
  const ultimateMeter = hasUltimate
    ? (opts.ultimateMeter !== undefined
      ? Math.max(0, Math.min(ultimateMax, Number(opts.ultimateMeter) || 0))
      : Math.max(0, Math.min(ultimateMax, Number(baseUnit.ultimateMeter ?? 0))))
    : null;
  const baseSkillRefs = tierGrants.skills.length
    ? [...(baseUnit.skills || []), ...tierGrants.skills]
    : (baseUnit.skills || []);
  const compiledSkills = _withUltimateSkill(
    _mergeSkills(baseSkillRefs, baseUnit.equipment || []),
    ultimateSkillId
  );

  // ── 8. Build compiled unit ──────────────────────────────────────
  const compiled: any = {
    // Identity
    instanceId:    id,
    baseId:        baseUnit.id,
    campaignPartyId: baseUnit.campaignPartyId || null,
    name:          baseUnit.name,
    icon:          baseUnit.icon,
    portrait:      baseUnit.portrait || '',
    portraitFocus: baseUnit.portraitFocus || null,
    team:          baseUnit.team || 'enemy',
    rank,
    level,
    levelScale,
    type:          baseUnit.type || 'humanoid',
    size:          baseUnit.size || '1x1',

    // Stats
    stats:         baseStats,
    compiledStats,

    // Resources
    maxHP,
    currentHP:     opts.currentHP !== undefined ? Math.min(opts.currentHP, maxHP) : maxHP,
    maxMP,
    currentMP:     opts.currentMP !== undefined ? Math.min(opts.currentMP, maxMP) : maxMP,

    // Ultimate meter
    ultimateMeter,
    ultimateMax,
    ultimateSkillId,

    // Defense
    dr: { physical: drPhysical, magic: drMagic, chaos: drChaos },

    // Offense modifiers
    critBonus:     mods.crit.chance || 0,
    critDmgBonus:  mods.crit.damage || 0,
    accuracyBonus: mods.accuracy || 0,
    evasionBonus:  mods.evasion || 0,
    damageFlat:    mods.damage.flat || 0,
    damagePercent: mods.damage.percent || 0,
    damageByElement: mods.damage.byElement || {},  // { Fire: 15 } → +15% fire dmg

    // Economy
    movement,
    baseAP,
    rangeBonus:    mods.range || 0,
    basicAttackRangeBonus: mods.basicAttackRange || 0,
    basicAttackRange: baseUnit.basicAttackRange ?? null,
    basicAttackPower: baseUnit.basicAttackPower ?? null,
    costMod:       mods.costMod || 0,
    cooldownMod:   mods.cooldownMod || 0,
    extraActions:  mods.extraActions || 0,

    // Elemental interaction
    weak, resist, immune,

    // Status resistances ({statusId: percent chance to resist})
    statusResist:  mods.statusResist || {},

    // References (for use by action-handler, etc.)
    skills:        compiledSkills,
    equipment:     baseUnit.equipment || [],
    innatePassives:augmentedBaseUnit.innatePassives || [],
    passiveRanks:  baseUnit.passiveRanks || {},

    // ── Authored runtime fields (must survive compile for combat systems) ──
    behaviorAI:       baseUnit.behaviorAI || null,
    aiRules:          baseUnit.aiRules || [],
    loot:             baseUnit.loot || [],
    inventory:        baseUnit.inventory || [],
    battleSfx:        baseUnit.battleSfx || {},
    statusImmunities: baseUnit.statusImmunities || [],
    activePersona:          baseUnit.activePersona || null,
    personaName:            baseUnit.personaName || '',
    personaWorld:           baseUnit.personaWorld || '',
    personaOutOfWorld:      !!baseUnit.personaOutOfWorld,
    damageDealtMultiplier:  Number(baseUnit.damageDealtMultiplier ?? 1),
    damageTakenMultiplier:  Number(baseUnit.damageTakenMultiplier ?? 1),

    // Active statuses (carried through from opts — status-manager owns these)
    activeStatuses: opts.activeStatuses || [],

    // Effects flat list — split for fast lookup by trigger
    effectsByTrigger: _indexEffectsByTrigger(effects),
    allEffects:       effects,

    // Turn state — reset by combat-manager each turn
    turnState: {
      hasMoved:        false,
      mainActionUsed:  false,
      apRemaining:     baseAP,
      bonusAP:         0,
      cooldowns:       {} // skillId → turns remaining
    }
  };

  return compiled;
}

// ── GATHER ALL EFFECT REFS ─────────────────────────────────────────
function _gatherEffectRefs(unit, activeStatuses) {
  const refs = [];
  const passiveRanks = unit.passiveRanks || {};

  // From innate passives
  for (const pid of (unit.innatePassives || [])) {
    if (DS().exists('passives', pid)) {
      const passive = DS().get('passives', pid);
      const rank = Math.max(1, Number(passiveRanks[pid] || 1));
      const rankedPassive = window.CJS.Formulas?.applyPassiveRankPerks
        ? window.CJS.Formulas.applyPassiveRankPerks(passive, rank)
        : passive;
      for (const ref of (rankedPassive.effects || [])) {
        refs.push({ ...ref, _passiveId: pid, _passiveRank: rank });
      }
    } else if (DS().exists('effects', pid)) {
      refs.push({ effectId: pid, overrides: {} });
    }
  }

  // From equipped items (each item carries effects that behave like passives)
  for (const iid of (unit.equipment || [])) {
    const item = DS().get('items', iid);
    if (!item) continue;
    for (const ref of (item.effects || [])) refs.push(ref);

    // Weapons contribute implicit modifiers via their weaponData
    if (item.slot === 'weapon' && item.weaponData) {
      // Weapon base damage / element is applied in damage-calc, not here.
    }
  }

  // From active statuses that carry passive-style effects
  for (const st of activeStatuses) {
    const def = _getStatusDefSafe(st.statusId);
    if (!def) continue;

    // ── Explicit passiveEffects array ──
    for (const ref of (def.passiveEffects || [])) {
      const overrides = { ...ref.overrides };
      if (ref.scaleByStacks && st.stacks > 1) {
        if (typeof overrides.value === 'number') {
          overrides.value = overrides.value * st.stacks;
        }
      }
      refs.push({ effectId: ref.effectId, overrides });
    }

    // ── Bridge inline modifiers from STATUS_DEFINITIONS ──
    _bridgeInlineModifiers(refs, def, st);
  }

  return refs;
}

// ── BRIDGE INLINE STATUS MODIFIERS ────────────────────────────────
function _bridgeInlineModifiers(refs, def, statusInstance) {
  const stacks = statusInstance.stacks || 1;

  // statMod: { S: -3, A: 2 } → one synthetic effect per stat
  if (def.statMod) {
    for (const [stat, val] of Object.entries(def.statMod) as Array<[string, any]>) {
      refs.push({
        effectId: `__synthetic_stat_${def.id || 'unknown'}_${stat}`,
        overrides: {},
        _synthetic: { trigger: 'stat_mod', stat, value: val * stacks, source: 'flat' }
      });
    }
  }

  // drMod: -5 → synthetic dr_mod effect
  if (def.drMod) {
    refs.push({
      effectId: `__synthetic_dr_${def.id || 'unknown'}`,
      overrides: {},
      _synthetic: { trigger: 'dr_mod', drType: 'all', value: def.drMod * stacks, source: 'flat' }
    });
  }

  // moveMod: -2 → synthetic movement_mod effect
  if (def.moveMod) {
    refs.push({
      effectId: `__synthetic_move_${def.id || 'unknown'}`,
      overrides: {},
      _synthetic: { trigger: 'movement_mod', value: def.moveMod * stacks, source: 'flat' }
    });
  }

  // accuracyMod: -50 → synthetic accuracy_mod effect
  if (def.accuracyMod) {
    refs.push({
      effectId: `__synthetic_acc_${def.id || 'unknown'}`,
      overrides: {},
      _synthetic: { trigger: 'accuracy_mod', value: def.accuracyMod, source: 'flat' }
    });
  }

  // critMod: 50 → synthetic crit_mod effect
  if (def.critMod) {
    refs.push({
      effectId: `__synthetic_crit_${def.id || 'unknown'}`,
      overrides: {},
      _synthetic: { trigger: 'crit_mod', value: def.critMod, source: 'flat' }
    });
  }

  // damageMod: 30 → synthetic damage_mod effect (percent)
  if (def.damageMod) {
    refs.push({
      effectId: `__synthetic_dmg_${def.id || 'unknown'}`,
      overrides: {},
      _synthetic: { trigger: 'damage_mod', value: def.damageMod, source: 'percent' }
    });
  }
}

// Safe lookup: StatusManager if available, else DataStore, else CONST
function _getStatusDefSafe(statusId) {
  if (SM() && SM().getStatusDef) return SM().getStatusDef(statusId);
  const custom = DS().get('statuses', statusId);
  if (custom) return custom;
  const builtins = C().STATUS_DEFINITIONS;
  if (builtins && builtins[statusId]) return { id: statusId, ...builtins[statusId] };
  return null;
}

function _resolveRefs(refs) {
  // Handle both real effect refs and synthetic ones
  const resolved = [];
  for (const ref of refs) {
    if (ref._synthetic) {
      // Synthetic effects from inline status modifiers — pass through directly
      resolved.push(ref._synthetic);
      continue;
    }
    const master = DS().get('effects', ref.effectId);
    if (!master) {
      // Skip missing effects silently (already warned by DataStore)
      continue;
    }
    let merged = (!ref.overrides || Object.keys(ref.overrides).length === 0)
      ? { ...master }
      : { ...master, ...ref.overrides, id: master.id };
    merged = _applyPassiveRankFieldDeltas(merged, ref);
    if (ref._passiveId && ref._passiveRank > 1 && !ref._passivePerkEffect && window.CJS.Formulas?.applyPassiveRankToEffect) {
      const passive = DS().get('passives', ref._passiveId);
      resolved.push(window.CJS.Formulas.applyPassiveRankToEffect(merged, passive, ref._passiveRank));
    } else {
      resolved.push(merged);
    }
  }
  return resolved;
}

function _applyPassiveRankFieldDeltas(effect, ref: any = {}) {
  const out = { ...effect };
  const legacyValueDelta = Number(ref._passiveRankValueDelta || 0);
  if (legacyValueDelta && typeof out.value === 'number') out.value += legacyValueDelta;

  const deltas = ref._passiveRankFieldDeltas || {};
  for (const [field, rawDelta] of Object.entries(deltas)) {
    const delta = Number(rawDelta || 0);
    if (!field || !delta || !Number.isFinite(delta) || typeof out[field] !== 'number') continue;
    out[field] = Math.round((out[field] + delta) * 100) / 100;
  }
  return out;
}

// ── INDEX EFFECTS BY TRIGGER FOR FAST LOOKUP ───────────────────────
function _indexEffectsByTrigger(effects) {
  const idx = {};
  for (const eff of effects) {
    const t = eff.trigger || 'on_hit';
    if (!idx[t]) idx[t] = [];
    idx[t].push(eff);
  }
  return idx;
}

// ── COLLECT MODIFIERS FROM PASSIVE EFFECTS ─────────────────────────
function _collectModifiers(effects): any {
  // First pass: collect all individual modifier values by type
  const rawMods = {
    stat: {},        // { S: [3, -2, 5], P: [1] }
    dr: {},          // { physical: [5, 3], all: [-2] }
    element: { weak: [], resist: [], immune: [] },
    crit: { chance: [], damage: [] },
    damage: { flat: [], percent: [], byElement: {} },
    accuracy: [],
    evasion: [],
    movement: [],
    range: [],
    basicAttackRange: [],
    ap: [],
    hpFlat: [], hpPercent: [],
    mpFlat: [], mpPercent: [],
    costMod: [],
    cooldownMod: [],
    extraActions: 0,
    statusResist: {}
  };

  for (const eff of effects) {
    if (!PASSIVE_TRIGGERS.has(eff.trigger)) continue;

    const v = eff.value || 0;

    switch (eff.trigger) {
      case 'stat_mod': {
        const s = eff.stat;
        if (s) {
          if (!rawMods.stat[s]) rawMods.stat[s] = [];
          rawMods.stat[s].push(v);
        }
        break;
      }
      case 'dr_mod': {
        const k = (eff.drType || 'all').toLowerCase();
        if (!rawMods.dr[k]) rawMods.dr[k] = [];
        rawMods.dr[k].push(v);
        break;
      }
      case 'element_mod': {
        const el = eff.element;
        const mode = eff.elementMode || eff.interaction || 'weak';
        if (el && rawMods.element[mode]) {
          rawMods.element[mode].push(el);
        }
        break;
      }
      case 'crit_mod': {
        if ((eff.critType || 'chance') === 'damage') {
          rawMods.crit.damage.push(v);
        } else {
          rawMods.crit.chance.push(v);
        }
        break;
      }
      case 'evasion_mod':   rawMods.evasion.push(v); break;
      case 'accuracy_mod':  rawMods.accuracy.push(v); break;
      case 'ap_mod':        rawMods.ap.push(v); break;
      case 'movement_mod':  rawMods.movement.push(v); break;
      case 'range_mod':
        if (_isBasicAttackRangeMod(eff)) rawMods.basicAttackRange.push(v);
        else rawMods.range.push(v);
        break;
      case 'cost_mod':      rawMods.costMod.push(v); break;
      case 'cooldown_mod':  rawMods.cooldownMod.push(v); break;
      case 'damage_mod': {
        if (eff.element) {
          if (!rawMods.damage.byElement[eff.element]) rawMods.damage.byElement[eff.element] = [];
          rawMods.damage.byElement[eff.element].push(v);
        } else if (eff.source === 'percent') {
          rawMods.damage.percent.push(v);
        } else {
          rawMods.damage.flat.push(v);
        }
        break;
      }
      case 'hp_mod': {
        if (eff.source === 'percent') rawMods.hpPercent.push(v);
        else rawMods.hpFlat.push(v);
        break;
      }
      case 'mp_mod': {
        if (eff.source === 'percent') rawMods.mpPercent.push(v);
        else rawMods.mpFlat.push(v);
        break;
      }
      case 'status_resist_mod': {
        if (eff.statusId) {
          rawMods.statusResist[eff.statusId] = (rawMods.statusResist[eff.statusId] || 0) + v;
        }
        break;
      }
      case 'double_action': rawMods.extraActions += 1; break;
      case 'triple_action': rawMods.extraActions += 2; break;
    }
  }

  // Second pass: apply stacking cap (top 5 highest by absolute value) and sum
  const mods = {
    stat: {},
    dr: {},
    element: rawMods.element,
    crit: {
      chance: _cappedSum(rawMods.crit.chance),
      damage: _cappedSum(rawMods.crit.damage)
    },
    damage: {
      flat:      _cappedSum(rawMods.damage.flat),
      percent:   _cappedSum(rawMods.damage.percent),
      byElement: {}
    },
    accuracy:    _cappedSum(rawMods.accuracy),
    evasion:     _cappedSum(rawMods.evasion),
    movement:    _sumAll(rawMods.movement),    // movement: no cap (small numbers)
    range:       _sumAll(rawMods.range),
    basicAttackRange: _sumAll(rawMods.basicAttackRange),
    ap:          _sumAll(rawMods.ap),
    hpFlat:      _sumAll(rawMods.hpFlat),
    hpPercent:   _sumAll(rawMods.hpPercent),
    mpFlat:      _sumAll(rawMods.mpFlat),
    mpPercent:   _sumAll(rawMods.mpPercent),
    costMod:     _sumAll(rawMods.costMod),
    cooldownMod: _sumAll(rawMods.cooldownMod),
    extraActions: rawMods.extraActions,
    statusResist: rawMods.statusResist
  };

  // Stat mods: cap per stat
  for (const [stat, vals] of Object.entries(rawMods.stat)) {
    mods.stat[stat] = _cappedSum(vals);
  }

  // DR mods: cap per type
  for (const [drType, vals] of Object.entries(rawMods.dr)) {
    mods.dr[drType] = _cappedSum(vals);
  }

  // Damage by element: cap per element
  for (const [el, vals] of Object.entries(rawMods.damage.byElement)) {
    mods.damage.byElement[el] = _cappedSum(vals);
  }

  return mods;
}

function _isBasicAttackRangeMod(eff) {
  const scope = String(eff.appliesTo || eff.scope || eff.rangeScope || eff.targetAction || '').toLowerCase();
  return eff.basicAttackOnly === true ||
    ['basic', 'basic_attack', 'weapon_attack', 'basic attack'].includes(scope);
}

// Sum the top STACKING_CAP values by absolute magnitude
function _cappedSum(values) {
  if (!values || values.length === 0) return 0;
  if (values.length <= STACKING_CAP) return values.reduce((a, b) => a + b, 0);

  // Sort by absolute value descending, keep top N
  const sorted = [...values].sort((a, b) => Math.abs(b) - Math.abs(a));
  return sorted.slice(0, STACKING_CAP).reduce((a, b) => a + b, 0);
}

// Sum all values (no cap)
function _sumAll(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0);
}

function _mergeUnique(a, b) {
  const set = new Set([...(a || []), ...(b || [])]);
  return Array.from(set);
}

// Collect skill / passive IDs granted by levelTiers entries at/below the unit's
// spawn level. Unlocks authored abilities as monsters scale up.
function _collectLevelTierGrants(baseUnit, level) {
  const out = { skills: [], passives: [] };
  const tiers = Array.isArray(baseUnit?.levelTiers) ? baseUnit.levelTiers : [];
  if (!tiers.length) return out;
  const cap = Math.max(1, Number(level || 1));
  for (const tier of tiers) {
    const threshold = Number(tier?.level || 0);
    if (!threshold || threshold > cap) continue;
    for (const sid of (tier.grantsSkills || [])) {
      if (sid && !out.skills.includes(sid)) out.skills.push(sid);
    }
    for (const pid of (tier.grantsPassives || [])) {
      if (pid && !out.passives.includes(pid)) out.passives.push(pid);
    }
  }
  return out;
}

// Merge base skills with any skills granted by equipped items.
// Uses SkillResolver to PRESERVE overrides and level data.
function _mergeSkills(baseSkills, equipmentIds) {
  const SR = window.CJS.SkillResolver;
  if (SR) return SR.mergeWithGrantedSkills(baseSkills, equipmentIds);

  // Fallback if SkillResolver not loaded (should not happen in combat)
  const all = new Set();
  for (const entry of baseSkills) {
    const skillId = typeof entry === 'string' ? entry : entry.skillId;
    if (skillId) all.add(skillId);
  }
  for (const itemId of equipmentIds) {
    const item = DS().get('items', itemId);
    if (item?.grantedSkills) {
      for (const sid of item.grantedSkills) all.add(sid);
    }
  }
  return Array.from(all);
}

function _withUltimateSkill(skills, ultimateSkillId) {
  if (!ultimateSkillId) return skills;
  const list = Array.isArray(skills) ? skills.slice() : [];
  const hasSkill = list.some((entry) => (typeof entry === 'string' ? entry : entry?.skillId) === ultimateSkillId);
  if (hasSkill) return list;
  list.push({ skillId: ultimateSkillId, overrides: {}, level: 1, source: 'ultimate' });
  return list;
}

// ── RECOMPILE (for mid-combat buff/debuff changes) ────────────────
// Only recomputes derived stat fields. PRESERVES all live combat state.
function recompile(compiledUnit, baseUnit) {
  const statuses = compiledUnit.activeStatuses || [];
  const fresh = compileUnit(baseUnit, compiledUnit.instanceId, {
    currentHP: compiledUnit.currentHP,
    currentMP: compiledUnit.currentMP,
    activeStatuses: statuses
  });
  if (!fresh) return compiledUnit;

  // ── Preserve live combat state that recompile must NOT touch ──
  fresh.turnState      = compiledUnit.turnState;
  fresh.activeStatuses = compiledUnit.activeStatuses;
  if (compiledUnit.pos !== undefined)       fresh.pos = compiledUnit.pos;
  if (compiledUnit._deathProcessed)         fresh._deathProcessed = true;
  if (compiledUnit._defendDRBoost)          fresh._defendDRBoost = compiledUnit._defendDRBoost;
  if (compiledUnit._needsRecompile != null) fresh._needsRecompile = false;

  return fresh;
}

// ── PREVIEW (for editors — what would this unit look like?) ───────
function previewUnit(baseUnit) {
  const c = compileUnit(baseUnit, baseUnit.id);
  if (!c) return null;
  return {
    maxHP: c.maxHP, maxMP: c.maxMP,
    drPhysical: c.dr.physical, drMagic: c.dr.magic, drChaos: c.dr.chaos,
    movement: c.movement, baseAP: c.baseAP,
    critBonus: c.critBonus, critDmgBonus: c.critDmgBonus,
    accuracyBonus: c.accuracyBonus, evasionBonus: c.evasionBonus,
    compiledStats: c.compiledStats,
    weak: c.weak, resist: c.resist, immune: c.immune,
    effectCount: c.allEffects.length
  };
}

// ── PUBLIC API ─────────────────────────────────────────────────────
export const StatCompiler: CJSStatCompiler = Object.freeze({
  compileUnit,
  recompile,
  previewUnit
});

// Runtime compatibility install — keep window.CJS.StatCompiler identical to the
// legacy IIFE so every existing consumer (and the vanilla engine) is unchanged.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.StatCompiler = StatCompiler;
