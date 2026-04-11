// effect-registry.js
// Master effect library: CRUD, templates, override merging,
// auto-description, validation.
// Reads: data-store.js, value-calc.js, conditions.js, constants.js
// Used by: all editors, effect-resolver.js, stat-compiler.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.EffectRegistry = (() => {
  'use strict';

  const Store  = () => window.CJS.DataStore;
  const VCalc  = () => window.CJS.ValueCalc;
  const Cond   = () => window.CJS.Conditions;
  const C      = () => window.CJS.CONST;

  // ── EFFECT TEMPLATE SHAPE ──────────────────────────────────────────
  // This is the "blank form" for creating a new effect.
  function createBlankEffect() {
    return {
      id:           null,       // auto-generated
      name:         '',
      icon:         '✦',
      description:  '',

      // WHEN
      trigger:      'on_hit',   // from EFFECT_TRIGGERS
      // WHO
      target:       'target',   // from EFFECT_TARGETS
      // WHAT
      action:       'damage',   // from EFFECT_ACTIONS
      // HOW MUCH
      value:        0,
      source:       'flat',     // from VALUE_SOURCES or "dice:XdY" / "stored:X"

      // Conditions (optional gate)
      conditions:   [],

      // Duration
      duration:     null,       // null = passive/permanent, number = turns
      stacks:       false,
      maxStacks:    1,

      // Sub-effects (for complex multi-action effects)
      children:     [],         // array of child effect objects
      storeResult:  null,       // save result as named variable

      // Specific fields (depends on action type)
      element:      null,       // for damage effects
      damageType:   null,       // "Physical" | "Magic" | "Chaos" | "True"
      stat:         null,       // for stat_mod: which stat (S,P,E,C,I,A,L)
      drType:       null,       // for dr_mod: "physical" | "magic" | "chaos" | "all"
      statusId:     null,       // for status_apply: which status to apply
      terrainType:  null,       // for terrain_create: which terrain
      summonId:     null,       // for summon: which unit to create
      aoeShape:     null,       // for AoE: "radius" | "line" | "cone" | "cross"
      aoeSize:      null,       // for AoE: size in cells
      threshold:    null,       // for on_low_hp / execute: HP % threshold

      // Cleansing
      cleansedBy:   [],         // elements or effect types that remove this

      // Metadata
      tags:         [],         // for search/filter
      category:     'triggered',// "passive" | "triggered" | "status" | "complex"
      overridable:  ['value', 'duration'],  // fields exposed for override in editors

      // Display
      color:        null        // override color for UI
    };
  }

  // ── CRUD (delegates to DataStore) ──────────────────────────────────

  function createEffect(effectData) {
    const effect = { ...createBlankEffect(), ...effectData };
    if (!effect.description) {
      effect.description = autoDescribe(effect);
    }
    effect.category = _inferCategory(effect);
    return Store().create('effects', effect);
  }

  function getEffect(id) {
    return Store().get('effects', id);
  }

  function updateEffect(id, changes) {
    const result = Store().update('effects', id, changes);
    // Regenerate description if content fields changed
    const effect = getEffect(id);
    if (effect && !changes.description) {
      Store().update('effects', id, { description: autoDescribe(effect) });
    }
    return result;
  }

  function deleteEffect(id) {
    return Store().remove('effects', id);
  }

  function duplicateEffect(id) {
    return Store().duplicate('effects', id);
  }

  function getAllEffects() {
    return Store().getAllAsArray('effects');
  }

  function searchEffects(query) {
    return Store().search('effects', query);
  }

  // ── OVERRIDE MERGING ───────────────────────────────────────────────
  // Takes a master effect and an overrides object, returns merged copy.

  function mergeWithOverrides(masterEffect, overrides) {
    if (!overrides || Object.keys(overrides).length === 0) {
      return { ...masterEffect };
    }
    const merged = { ...masterEffect };
    for (const [key, val] of Object.entries(overrides)) {
      if (key === 'id') continue;  // never override ID
      if (key === 'children' && Array.isArray(val)) {
        // Children: merge by index or replace
        merged.children = val;
      } else {
        merged[key] = val;
      }
    }
    return merged;
  }

  // Resolve an effect reference (effectId + overrides) to a full effect
  function resolveRef(ref) {
    const master = getEffect(ref.effectId);
    if (!master) {
      console.warn(`EffectRegistry: effect "${ref.effectId}" not found`);
      return null;
    }
    return mergeWithOverrides(master, ref.overrides);
  }

  // Resolve an array of effect references
  function resolveRefs(refs) {
    return (refs || []).map(ref => resolveRef(ref)).filter(Boolean);
  }

  // ── AUTO-DESCRIPTION ───────────────────────────────────────────────

  function autoDescribe(effect) {
    const parts = [];

    // Trigger
    const triggerDesc = _describeTrigger(effect.trigger);
    if (triggerDesc) parts.push(triggerDesc);

    // Action + value
    const actionDesc = _describeAction(effect);
    parts.push(actionDesc);

    // Target
    if (effect.target && effect.target !== 'self' && effect.target !== 'target') {
      parts.push(`to ${_describeTarget(effect.target)}`);
    }

    // Conditions
    if (effect.conditions && effect.conditions.length > 0) {
      const condDescs = effect.conditions.map(c => Cond().describe(c));
      parts.push(`(if ${condDescs.join(' and ')})`);
    }

    // Duration
    if (effect.duration) {
      parts.push(`for ${effect.duration} turn${effect.duration > 1 ? 's' : ''}`);
    }

    return parts.join(' ');
  }

  function _describeTrigger(trigger) {
    const map = {
      on_hit:            'On hit:',
      on_take_damage:    'When hit:',
      on_kill:           'On kill:',
      on_death:          'On death:',
      on_turn_start:     'Turn start:',
      on_turn_end:       'Turn end:',
      on_battle_start:   'Battle start:',
      on_low_hp:         'When low HP:',
      on_dodge:          'On dodge:',
      on_move:           'On move:',
      on_crit:           'On crit:',
      on_miss:           'On miss:',
      on_ally_hit:       'When ally hit:',
      on_status_applied: 'When debuffed:',
      on_counter:        'On counter:',
      on_heal_received:  'When healed:',
      on_skill_use:      'On skill use:',
      on_item_use:       'On item use:'
    };
    return map[trigger] || null;
  }

  function _describeAction(effect) {
    const val = VCalc().describeValue(effect.value, effect.source);
    const elem = effect.element ? ` ${effect.element}` : '';

    switch (effect.action) {
      case 'damage':       return `Deal ${val}${elem} damage`;
      case 'heal':         return `Heal ${val} HP`;
      case 'mp_restore':   return `Restore ${val} MP`;
      case 'mp_drain':     return `Drain ${val} MP`;
      case 'hp_drain':     return `Drain ${val} HP`;
      case 'status_apply': return `Apply ${effect.statusId || 'status'} (${val})`;
      case 'status_remove':return `Remove ${effect.statusId || 'status'}`;
      case 'reflect':      return `Reflect ${val} damage`;
      case 'absorb':       return `Absorb ${val} damage`;
      case 'counter':      return `Counter for ${val} damage`;
      case 'revive':       return `Revive at ${val} HP`;
      case 'knockback':    return `Knockback ${val} cells`;
      case 'pull':         return `Pull ${val} cells`;
      case 'teleport':     return `Teleport`;
      case 'terrain_create':return `Create ${effect.terrainType || 'terrain'}`;
      case 'summon':       return `Summon ${effect.summonId || 'unit'}`;
      case 'steal_buff':   return `Steal a buff`;
      case 'execute':      return `Execute below ${effect.threshold || 20}% HP`;
      case 'extra_action': return `Grant extra action`;
      case 'damage_block': return `Block ${val} damage`;
      case 'cooldown_reset':return `Reset cooldowns`;
      case 'ap_grant':     return `Grant ${val} AP`;
      default:
        // Passive stat mods
        if (effect.action === 'stat_mod' || effect.trigger === 'stat_mod') {
          return `${effect.stat || 'STAT'} ${effect.value >= 0 ? '+' : ''}${effect.value}`;
        }
        if (effect.action === 'dr_mod' || effect.trigger === 'dr_mod') {
          return `${effect.drType || 'all'} DR ${effect.value >= 0 ? '+' : ''}${effect.value}`;
        }
        return `${effect.action} ${val}`;
    }
  }

  function _describeTarget(target) {
    const map = {
      self:              'self',
      target:            'target',
      attacker:          'attacker',
      host:              'host',
      all_allies:        'all allies',
      all_enemies:       'all enemies',
      all:               'everyone',
      random_enemy:      'random enemy',
      random_ally:       'random ally',
      lowest_hp_ally:    'lowest HP ally',
      lowest_hp_enemy:   'lowest HP enemy',
      highest_hp_enemy:  'highest HP enemy',
      adjacent_to_self:  'adjacent units',
      adjacent_to_target:'units near target',
      nearest_enemy:     'nearest enemy',
      furthest_enemy:    'furthest enemy'
    };
    return map[target] || target;
  }

  // ── CATEGORY INFERENCE ─────────────────────────────────────────────

  function _inferCategory(effect) {
    const passiveTriggers = C().EFFECT_TRIGGERS.passive;
    if (passiveTriggers.includes(effect.trigger)) return 'passive';
    if (effect.children && effect.children.length > 0) return 'complex';
    if (effect.duration && effect.action === 'status_apply') return 'status';
    return 'triggered';
  }

  // ── GROUPED LISTING (for editor UI) ────────────────────────────────

  function getEffectsGroupedByCategory() {
    const all = getAllEffects();
    const groups = {
      passive:   [],
      triggered: [],
      status:    [],
      complex:   []
    };
    for (const eff of all) {
      const cat = eff.category || 'triggered';
      if (groups[cat]) groups[cat].push(eff);
      else groups.triggered.push(eff);
    }
    return groups;
  }

  function getEffectsGroupedByAction() {
    const all = getAllEffects();
    const groups = {};
    for (const eff of all) {
      const action = eff.action || eff.trigger || 'other';
      if (!groups[action]) groups[action] = [];
      groups[action].push(eff);
    }
    return groups;
  }

  // ── VALIDATION ─────────────────────────────────────────────────────

  function validateEffect(effect) {
    const errors = [];

    if (!effect.name) errors.push('Name is required');
    if (!effect.trigger && !effect.action) errors.push('Must have a trigger or action');
    if (effect.value === undefined || effect.value === null) {
      // Some actions don't need a value
      const noValueActions = ['extra_action', 'cooldown_reset', 'teleport',
                              'steal_buff', 'dispel_buffs', 'dispel_debuffs',
                              'purge_all', 'clone'];
      if (!noValueActions.includes(effect.action)) {
        errors.push('Value is required');
      }
    }
    if (effect.action === 'status_apply' && !effect.statusId) {
      errors.push('Status Apply requires a statusId');
    }
    if (effect.action === 'terrain_create' && !effect.terrainType) {
      errors.push('Terrain Create requires a terrainType');
    }
    if ((effect.trigger === 'stat_mod' || effect.action === 'stat_mod') && !effect.stat) {
      errors.push('Stat Mod requires a stat (S, P, E, C, I, A, L)');
    }

    return { valid: errors.length === 0, errors };
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    // Templates
    createBlankEffect,
    // CRUD
    createEffect, getEffect, updateEffect, deleteEffect, duplicateEffect,
    getAllEffects, searchEffects,
    // Override system
    mergeWithOverrides, resolveRef, resolveRefs,
    // Description
    autoDescribe,
    // Grouping
    getEffectsGroupedByCategory, getEffectsGroupedByAction,
    // Validation
    validateEffect
  });
})();
