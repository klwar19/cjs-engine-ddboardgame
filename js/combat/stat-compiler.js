// stat-compiler.js
// Takes a raw character/monster + their skills/items/passives/statuses
// and produces a COMPILED UNIT: final stats, HP/MP/DR, movement, and a
// flat list of all effects (both passive-modifiers and triggered ones).
//
// Called at combat start, and whenever passive-affecting buffs/debuffs change.
//
// STACKING RULES (enforced here):
//   Stats/DR/Move:  Additive. Sum all bonuses/penalties. Cap: top 5 sources.
//   Damage %:       Additive within sources. Cap: top 5 sources.
//   Crit chance:    Additive. Cap: top 5 sources.
//   HP/MP %:        Additive.
//
// Reads: data-store, formulas, constants, status-manager
// Used by: combat-manager (combat startup), status-manager (on buff change)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.StatCompiler = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const F  = () => window.CJS.Formulas;
  const DS = () => window.CJS.DataStore;
  const SM = () => window.CJS.StatusManager;

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
  // baseUnit: the character/monster record (plain object from DataStore)
  // instanceId: unique ID for this unit instance in combat (same as baseUnit.id
  //             for singletons; suffixed for summons/duplicates)
  // opts: { currentHP?, currentMP?, activeStatuses?[] } — for mid-combat recompile
  function compileUnit(baseUnit, instanceId, opts = {}) {
    if (!baseUnit) return null;
    const id = instanceId || baseUnit.id;

    // ── 1. Gather all effect references ────────────────────────────
    const effectRefs = _gatherEffectRefs(baseUnit, opts.activeStatuses || []);

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

    // ── 6. Calculate derived values ────────────────────────────────
    const rank = baseUnit.rank || 'F';
    let maxHP = F().calcMaxHP(compiledStats, rank) + (mods.hpFlat || 0);
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

    // ── 8. Build compiled unit ──────────────────────────────────────
    const compiled = {
      // Identity
      instanceId:    id,
      baseId:        baseUnit.id,
      name:          baseUnit.name,
      icon:          baseUnit.icon,
      portrait:      baseUnit.portrait || '',
      team:          baseUnit.team || 'enemy',
      rank,
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
      costMod:       mods.costMod || 0,
      cooldownMod:   mods.cooldownMod || 0,
      extraActions:  mods.extraActions || 0,

      // Elemental interaction
      weak, resist, immune,

      // Status resistances ({statusId: percent chance to resist})
      statusResist:  mods.statusResist || {},

      // References (for use by action-handler, etc.)
      // Merge base skills + item-granted skills, PRESERVING overrides/level
      skills:        _mergeSkills(baseUnit.skills || [], baseUnit.equipment || []),
      equipment:     baseUnit.equipment || [],
      innatePassives:baseUnit.innatePassives || [],

      // ── Authored runtime fields (must survive compile for combat systems) ──
      behaviorAI:       baseUnit.behaviorAI || null,
      aiRules:          baseUnit.aiRules || [],
      loot:             baseUnit.loot || [],
      inventory:        baseUnit.inventory || [],
      statusImmunities: baseUnit.statusImmunities || [],

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

    // From innate passives
    for (const pid of (unit.innatePassives || [])) {
      // A passive ID may reference either a stored Passive (bundle of effects)
      // or a raw Effect. Support both.
      if (DS().exists('passives', pid)) {
        const passive = DS().get('passives', pid);
        for (const ref of (passive.effects || [])) refs.push(ref);
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
        // But if weapon grants flat stat bonuses via effects, those come through the refs above.
      }
    }

    // From active statuses that carry passive-style effects
    // Uses dual lookup via StatusManager.getStatusDef()
    for (const st of activeStatuses) {
      const def = _getStatusDefSafe(st.statusId);
      if (!def) continue;

      // ── Explicit passiveEffects array ──
      for (const ref of (def.passiveEffects || [])) {
        // Status effects may scale by stacks — bake stackCount into overrides
        const overrides = { ...ref.overrides };
        if (ref.scaleByStacks && st.stacks > 1) {
          if (typeof overrides.value === 'number') {
            overrides.value = overrides.value * st.stacks;
          }
        }
        refs.push({ effectId: ref.effectId, overrides });
      }

      // ── Bridge inline modifiers from STATUS_DEFINITIONS ──
      // Convert statMod, drMod, moveMod, accuracyMod, critMod, damageMod
      // into synthetic passive effects that stat-compiler can process.
      _bridgeInlineModifiers(refs, def, st);
    }

    return refs;
  }

  // ── BRIDGE INLINE STATUS MODIFIERS ────────────────────────────────
  // STATUS_DEFINITIONS uses inline fields like statMod: {S:-3}, drMod: -5, etc.
  // Convert these into synthetic effect-like objects that _collectModifiers understands.
  function _bridgeInlineModifiers(refs, def, statusInstance) {
    const stacks = statusInstance.stacks || 1;

    // statMod: { S: -3, A: 2 } → one synthetic effect per stat
    if (def.statMod) {
      for (const [stat, val] of Object.entries(def.statMod)) {
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
      if (!ref.overrides || Object.keys(ref.overrides).length === 0) {
        resolved.push({ ...master });
      } else {
        resolved.push({ ...master, ...ref.overrides, id: master.id });
      }
    }
    return resolved;
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
  // Applies stacking cap: for stat_mod, dr_mod, damage_mod, crit_mod, etc.,
  // only the top STACKING_CAP (5) highest absolute values are kept.
  function _collectModifiers(effects) {
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
        case 'range_mod':     rawMods.range.push(v); break;
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

  // Sum the top STACKING_CAP values by absolute magnitude
  // Keeps both positive and negative — sorts by |value| descending, takes top N
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

  // ── RECOMPILE (for mid-combat buff/debuff changes) ────────────────
  // Only recomputes derived stat fields. PRESERVES all live combat state:
  // turnState (cooldowns, AP, action flags), position, death flags, etc.
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
  return Object.freeze({
    compileUnit,
    recompile,
    previewUnit
  });
})();
