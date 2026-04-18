// stat-compiler.js
// Takes a raw character/monster + their skills/items/passives/statuses
// and produces a COMPILED UNIT: final stats, HP/MP/DR, movement, and a
// flat list of all effects (both passive-modifiers and triggered ones).
//
// Called at combat start, and whenever passive-affecting buffs/debuffs change.
//
// Reads: data-store, formulas, constants
// Used by: combat-manager (combat startup), status-manager (on buff change)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.StatCompiler = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const F  = () => window.CJS.Formulas;
  const DS = () => window.CJS.DataStore;

  // ── PASSIVE TRIGGER TYPES (modify stats BEFORE combat) ─────────────
  const PASSIVE_TRIGGERS = new Set([
    'stat_mod', 'dr_mod', 'element_mod', 'crit_mod', 'evasion_mod',
    'accuracy_mod', 'ap_mod', 'movement_mod', 'range_mod', 'cost_mod',
    'cooldown_mod', 'damage_mod', 'hp_mod', 'mp_mod',
    'status_resist_mod', 'double_action', 'triple_action'
  ]);

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

    // ── 5. Apply stat modifiers ────────────────────────────────────
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
      // Merge base skills + any skills granted by equipped items
      skills:        _mergeSkills(baseUnit.skills || [], baseUnit.equipment || []),
      equipment:     baseUnit.equipment || [],
      innatePassives:baseUnit.innatePassives || [],

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
    // (e.g. Weakness status has a stat_mod effect)
    for (const st of activeStatuses) {
      const def = DS().get('statuses', st.statusId);
      if (!def) continue;
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
    }

    return refs;
  }

  function _resolveRefs(refs) {
    return DS().resolveEffectRefs(refs);
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
  function _collectModifiers(effects) {
    const mods = {
      stat: {},
      dr: {},
      element: { weak: [], resist: [], immune: [] },
      crit: { chance: 0, damage: 0 },
      damage: { flat: 0, percent: 0, byElement: {} },
      accuracy: 0,
      evasion: 0,
      movement: 0,
      range: 0,
      ap: 0,
      hpFlat: 0, hpPercent: 0,
      mpFlat: 0, mpPercent: 0,
      costMod: 0,
      cooldownMod: 0,
      extraActions: 0,
      statusResist: {}
    };

    for (const eff of effects) {
      if (!PASSIVE_TRIGGERS.has(eff.trigger)) continue;

      const v = eff.value || 0;

      switch (eff.trigger) {
        case 'stat_mod': {
          const s = eff.stat;
          if (s) mods.stat[s] = (mods.stat[s] || 0) + v;
          break;
        }
        case 'dr_mod': {
          const k = (eff.drType || 'all').toLowerCase();
          mods.dr[k] = (mods.dr[k] || 0) + v;
          break;
        }
        case 'element_mod': {
          const el = eff.element;
          const mode = eff.elementMode || 'weak'; // 'weak' | 'resist' | 'immune'
          if (el && mods.element[mode]) {
            mods.element[mode].push(el);
          }
          break;
        }
        case 'crit_mod': {
          if ((eff.critType || 'chance') === 'damage') {
            mods.crit.damage += v;
          } else {
            mods.crit.chance += v;
          }
          break;
        }
        case 'evasion_mod':   mods.evasion  += v; break;
        case 'accuracy_mod':  mods.accuracy += v; break;
        case 'ap_mod':        mods.ap       += v; break;
        case 'movement_mod':  mods.movement += v; break;
        case 'range_mod':     mods.range    += v; break;
        case 'cost_mod':      mods.costMod  += v; break;
        case 'cooldown_mod':  mods.cooldownMod += v; break;
        case 'damage_mod': {
          if (eff.element) {
            mods.damage.byElement[eff.element] = (mods.damage.byElement[eff.element] || 0) + v;
          } else if (eff.source === 'percent') {
            mods.damage.percent += v;
          } else {
            mods.damage.flat += v;
          }
          break;
        }
        case 'hp_mod': {
          if (eff.source === 'percent') mods.hpPercent += v;
          else mods.hpFlat += v;
          break;
        }
        case 'mp_mod': {
          if (eff.source === 'percent') mods.mpPercent += v;
          else mods.mpFlat += v;
          break;
        }
        case 'status_resist_mod': {
          if (eff.statusId) {
            mods.statusResist[eff.statusId] = (mods.statusResist[eff.statusId] || 0) + v;
          }
          break;
        }
        case 'double_action': mods.extraActions += 1; break;
        case 'triple_action': mods.extraActions += 2; break;
      }
    }

    return mods;
  }

  function _mergeUnique(a, b) {
    const set = new Set([...(a || []), ...(b || [])]);
    return Array.from(set);
  }

  // Merge base skills with any skills granted by equipped items
  function _mergeSkills(baseSkills, equipmentIds) {
    const all = new Set(baseSkills);
    for (const itemId of equipmentIds) {
      const item = DS().get('items', itemId);
      if (item?.grantedSkills) {
        for (const sid of item.grantedSkills) all.add(sid);
      }
    }
    return Array.from(all);
  }

  // ── RECOMPILE (for mid-combat buff/debuff changes) ────────────────
  // Preserves current HP/MP and active statuses, recomputes everything else.
  function recompile(compiledUnit, baseUnit) {
    const statuses = compiledUnit.activeStatuses || [];
    return compileUnit(baseUnit, compiledUnit.instanceId, {
      currentHP: compiledUnit.currentHP,
      currentMP: compiledUnit.currentMP,
      activeStatuses: statuses
    });
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
