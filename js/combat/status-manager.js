// status-manager.js
// Tracks active statuses on all units. Handles apply, stack, tick, expire,
// cleanse, immunity, break-on-damage, and notifies stat-compiler to recompile
// when a passive-bearing status changes.
//
// Status definitions (from data-store 'statuses' collection):
//   {
//     id:              'burn',
//     name:            'Burn',
//     icon:            '🔥',
//     category:        'dot',        // from STATUS_CATEGORIES
//     element:         'Fire',
//     duration:        3,
//     stacks:          true,
//     maxStacks:       5,
//     refreshOnReapply:true,
//     cleansedBy:      ['Water'],     // element or type tags
//     breakOn:         [],            // ['damage', 'ally_damage']
//     passiveEffects:  [],            // [{ effectId, overrides, scaleByStacks }]
//     tickEffects:     [],            // [{ effectId, overrides }]
//     tickPhase:       'turn_start',  // when to fire ticks
//     preventsActions: false,         // stun/freeze/sleep
//     preventsMovement:false,         // root/slow
//     isBuff:          false,
//     description:     ''
//   }
//
// Status instance (attached to unit.activeStatuses[]):
//   { statusId, sourceUnitId, duration, stacks, appliedTurn }
//
// Reads: data-store, stat-compiler, damage-calc, combat-log, constants
// Used by: effect-resolver (on status_apply), combat-manager (on tick)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.StatusManager = (() => {
  'use strict';

  const DS  = () => window.CJS.DataStore;
  const SC  = () => window.CJS.StatCompiler;
  const DC  = () => window.CJS.DamageCalc;
  const Log = () => window.CJS.CombatLog;
  const VC  = () => window.CJS.ValueCalc;

  // ── APPLY STATUS ──────────────────────────────────────────────────
  // args: { target, statusId, sourceUnit, overrides?, combatContext }
  // Returns: { applied: bool, reason?: string, instance?: {...} }
  function applyStatus(args) {
    const { target, statusId, sourceUnit, overrides, combatContext } = args;
    if (!target) return { applied: false, reason: 'no_target' };

    const def = DS().get('statuses', statusId);
    if (!def) {
      // Not an error in a fresh game — the status may not be defined yet.
      // Create a minimal shell from overrides so effects can still fire.
      return _applyMinimal(target, statusId, sourceUnit, overrides);
    }

    // Immunity / resistance
    if (_isImmune(target, def)) {
      Log().record({
        type: 'status_resisted', actor: sourceUnit, target,
        tags: ['status_resisted', `status_${statusId}`, 'immune'],
        data: { statusId, reason: 'immune' }
      });
      return { applied: false, reason: 'immune' };
    }

    const resistChance = target.statusResist?.[statusId] || 0;
    if (resistChance > 0 && Math.random() * 100 < resistChance) {
      Log().record({
        type: 'status_resisted', actor: sourceUnit, target,
        tags: ['status_resisted', `status_${statusId}`],
        data: { statusId, resistChance }
      });
      return { applied: false, reason: 'resisted' };
    }

    // Find existing instance
    target.activeStatuses = target.activeStatuses || [];
    const existing = target.activeStatuses.find(s => s.statusId === statusId);

    const newDuration = overrides?.duration ?? def.duration ?? 3;
    const turn = combatContext?.turnNumber || Log().getTurn();

    if (existing) {
      if (def.stacks) {
        // Stack up to max
        const max = def.maxStacks || 1;
        const newStacks = Math.min(max, existing.stacks + 1);
        existing.stacks = newStacks;
        if (def.refreshOnReapply !== false) {
          existing.duration = Math.max(existing.duration, newDuration);
        }
      } else if (def.refreshOnReapply !== false) {
        existing.duration = Math.max(existing.duration, newDuration);
      } else {
        return { applied: false, reason: 'already_applied_no_refresh' };
      }
      if (_hasPassiveEffects(def)) _requestRecompile(target);
      Log().logStatusApplied({
        actor: sourceUnit, target, statusId,
        duration: existing.duration, stacks: existing.stacks
      });
      return { applied: true, instance: existing, refreshed: true };
    }

    // Fresh application
    const instance = {
      statusId,
      sourceUnitId: _idOf(sourceUnit),
      duration:     newDuration,
      stacks:       overrides?.stacks || 1,
      appliedTurn:  turn,
      overrides:    overrides || {}
    };

    target.activeStatuses.push(instance);

    Log().logStatusApplied({
      actor: sourceUnit, target, statusId,
      duration: instance.duration, stacks: instance.stacks
    });

    if (_hasPassiveEffects(def)) _requestRecompile(target);

    // Fire on_status_applied trigger (if effect-resolver is available)
    const Resolver = window.CJS.EffectResolver;
    if (Resolver) {
      Resolver.fireTrigger('on_status_applied', {
        unit: target, target, attacker: sourceUnit,
        statusId, ...combatContext
      });
    }

    return { applied: true, instance };
  }

  function _applyMinimal(target, statusId, sourceUnit, overrides) {
    target.activeStatuses = target.activeStatuses || [];
    const instance = {
      statusId,
      sourceUnitId: _idOf(sourceUnit),
      duration:     overrides?.duration ?? 3,
      stacks:       overrides?.stacks   ?? 1,
      appliedTurn:  Log().getTurn(),
      overrides:    overrides || {}
    };
    target.activeStatuses.push(instance);
    Log().logStatusApplied({
      actor: sourceUnit, target, statusId,
      duration: instance.duration, stacks: instance.stacks
    });
    return { applied: true, instance, minimal: true };
  }

  // ── TICK STATUSES ─────────────────────────────────────────────────
  // Called at turn_start and turn_end by combat-manager.
  // Fires tick effects, decrements duration, expires if 0.
  function tickStatuses(unit, phase) {
    if (!unit?.activeStatuses?.length) return;

    // Iterate a copy (removals allowed during tick)
    const snapshot = [...unit.activeStatuses];
    for (const st of snapshot) {
      const def = DS().get('statuses', st.statusId);
      if (!def) continue;
      if ((def.tickPhase || 'turn_start') !== phase) continue;

      // Fire each tick effect
      for (const ref of (def.tickEffects || [])) {
        _fireTickEffect(unit, st, def, ref);
      }

      // Decrement duration
      st.duration -= 1;
      if (st.duration <= 0) {
        removeStatus(unit, st.statusId, 'expired');
      }
    }
  }

  function _fireTickEffect(unit, statusInstance, statusDef, effectRef) {
    const master = DS().get('effects', effectRef.effectId);
    if (!master) return;
    const merged = { ...master, ...(effectRef.overrides || {}) };

    // Build a minimal context for value-calc
    const context = {
      caster: { compiledStats: unit.compiledStats, stats: unit.stats,
                maxHP: unit.maxHP, currentHP: unit.currentHP,
                maxMP: unit.maxMP, currentMP: unit.currentMP },
      target: { compiledStats: unit.compiledStats, stats: unit.stats,
                maxHP: unit.maxHP, currentHP: unit.currentHP },
      stackCount: statusInstance.stacks,
      turnNumber: Log().getTurn()
    };

    const raw = VC().resolve(merged.value, merged.source, context);

    switch (merged.action) {
      case 'damage': {
        DC().applyTickDamage({
          source: null, target: unit, amount: raw,
          element: merged.element || statusDef.element,
          damageType: merged.damageType || 'Physical',
          statusId: statusInstance.statusId
        });
        break;
      }
      case 'heal': {
        DC().applyHeal({
          actor: null, target: unit, amount: raw,
          source: `status_${statusInstance.statusId}`
        });
        break;
      }
      case 'mp_restore': {
        DC().applyMP({ target: unit, delta: raw });
        Log().logStatusTick({
          target: unit, statusId: statusInstance.statusId,
          effect: 'mp_restore', amount: raw
        });
        break;
      }
      default:
        Log().logStatusTick({
          target: unit, statusId: statusInstance.statusId,
          effect: merged.action, amount: raw
        });
    }
  }

  // ── REMOVE STATUS ─────────────────────────────────────────────────
  function removeStatus(unit, statusId, reason) {
    if (!unit?.activeStatuses) return false;
    const idx = unit.activeStatuses.findIndex(s => s.statusId === statusId);
    if (idx < 0) return false;
    const def = DS().get('statuses', statusId);
    unit.activeStatuses.splice(idx, 1);
    Log().logStatusRemoved({ target: unit, statusId, reason: reason || 'removed' });
    if (def && _hasPassiveEffects(def)) _requestRecompile(unit);
    return true;
  }

  // ── CLEANSE ───────────────────────────────────────────────────────
  // Remove statuses matching a category, element, or tag.
  // args: { unit, category?, element?, statusIds?, isBuffsOnly?, isDebuffsOnly? }
  function cleanse(args) {
    const { unit, category, element, statusIds, isBuffsOnly, isDebuffsOnly } = args;
    if (!unit?.activeStatuses) return 0;

    const toRemove = [];
    for (const st of unit.activeStatuses) {
      const def = DS().get('statuses', st.statusId);
      if (!def) continue;

      if (statusIds && !statusIds.includes(st.statusId)) continue;
      if (category  && def.category !== category) continue;
      if (element   && def.element  !== element)  continue;
      if (isBuffsOnly   && !def.isBuff) continue;
      if (isDebuffsOnly &&  def.isBuff) continue;

      toRemove.push(st.statusId);
    }

    for (const id of toRemove) removeStatus(unit, id, 'cleansed');
    return toRemove.length;
  }

  // ── BREAK CONDITIONS ──────────────────────────────────────────────
  // Called by combat-manager after damage events, ally damage, etc.
  // event: 'damage' | 'ally_damage' | 'move' | 'turn_start' | ...
  function checkBreakConditions(unit, event) {
    if (!unit?.activeStatuses?.length) return;
    const snapshot = [...unit.activeStatuses];
    for (const st of snapshot) {
      const def = DS().get('statuses', st.statusId);
      if (!def) continue;
      if ((def.breakOn || []).includes(event)) {
        removeStatus(unit, st.statusId, `broken_on_${event}`);
      }
    }
  }

  // ── QUERIES ──────────────────────────────────────────────────────

  function hasStatus(unit, statusId) {
    return !!(unit?.activeStatuses?.some(s => s.statusId === statusId));
  }

  function getStatus(unit, statusId) {
    return unit?.activeStatuses?.find(s => s.statusId === statusId) || null;
  }

  function getStatusStacks(unit, statusId) {
    const st = getStatus(unit, statusId);
    return st?.stacks || 0;
  }

  function hasAnyStatusWith(unit, predicate) {
    if (!unit?.activeStatuses) return false;
    for (const st of unit.activeStatuses) {
      const def = DS().get('statuses', st.statusId);
      if (def && predicate(def, st)) return true;
    }
    return false;
  }

  // Is this unit action-disabled (stun, freeze, sleep, petrify)?
  function canAct(unit) {
    return !hasAnyStatusWith(unit, (def) => def.preventsActions);
  }

  function canMove(unit) {
    return !hasAnyStatusWith(unit, (def) => def.preventsActions || def.preventsMovement);
  }

  function getActiveStatusesByCategory(unit) {
    const grouped = {};
    for (const st of (unit?.activeStatuses || [])) {
      const def = DS().get('statuses', st.statusId);
      const cat = def?.category || 'unknown';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ ...st, definition: def });
    }
    return grouped;
  }

  // ── INTERNAL HELPERS ──────────────────────────────────────────────
  function _isImmune(unit, statusDef) {
    // Check element immunity (burn is fire, freeze is water, etc.)
    if (statusDef.element && (unit.immune || []).includes(statusDef.element)) {
      return true;
    }
    // Check statusImmunities list
    if ((unit.statusImmunities || []).includes(statusDef.id)) return true;
    return false;
  }

  function _hasPassiveEffects(statusDef) {
    return (statusDef.passiveEffects || []).length > 0;
  }

  // Flag a unit for stat-compiler recompile. The actual recompile
  // happens at turn boundaries (combat-manager handles it) to avoid
  // thrashing in mid-action.
  function _requestRecompile(unit) {
    unit._needsRecompile = true;
  }

  function _idOf(u) {
    if (!u) return null;
    return typeof u === 'string' ? u : (u.instanceId || u.baseId || u.id || null);
  }

  // Called by combat-manager at phase boundaries to process recompile requests.
  // baseUnitProvider: (baseId) => rawCharacter/monster record from data-store.
  function processRecompileRequests(units, baseUnitProvider) {
    for (const unit of units) {
      if (!unit._needsRecompile) continue;
      const base = baseUnitProvider(unit.baseId);
      if (!base) { unit._needsRecompile = false; continue; }
      const recompiled = SC().recompile(unit, base);
      // Merge back in place (preserve object identity for grid-engine refs)
      Object.assign(unit, recompiled);
      unit._needsRecompile = false;
    }
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    applyStatus, removeStatus, cleanse,
    tickStatuses, checkBreakConditions,
    hasStatus, getStatus, getStatusStacks, hasAnyStatusWith,
    canAct, canMove,
    getActiveStatusesByCategory,
    processRecompileRequests
  });
})();
