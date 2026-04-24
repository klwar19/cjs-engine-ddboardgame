// status-manager.js
// Tracks active statuses on all units. Handles apply, stack, tick, expire,
// cleanse, immunity, break-on-damage, and notifies stat-compiler to recompile
// when a passive-bearing status changes.
//
// DUAL LOOKUP: checks DataStore 'statuses' first, then falls back to
// CONST.STATUS_DEFINITIONS for built-in statuses. This ensures built-in
// statuses (burn, stun, doom, etc.) work without needing manual DataStore
// entries, while still allowing custom statuses from the editor.
//
// DoT STACKING: Same-element DoTs keep the HIGHEST damage tick only (not
// additive). Different-element DoTs all stack and tick independently.
//
// Status instance (attached to unit.activeStatuses[]):
//   { statusId, sourceUnitId, duration, stacks, appliedTurn, overrides,
//     tickDamageValue?, absorbHP? }
//
// Reads: data-store, stat-compiler, damage-calc, combat-log, constants, value-calc
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
  const C   = () => window.CJS.CONST;

  // ── DUAL LOOKUP ─────────────────────────────────────────────────────
  // Check DataStore first (custom statuses from editor), then fall back
  // to CONST.STATUS_DEFINITIONS (built-in statuses like burn, stun, doom).
  function _getStatusDef(statusId) {
    // DataStore custom statuses take priority
    const custom = DS().get('statuses', statusId);
    if (custom) return custom;

    // Fall back to built-in STATUS_DEFINITIONS
    const builtins = C().STATUS_DEFINITIONS;
    if (builtins && builtins[statusId]) {
      return { id: statusId, ...builtins[statusId] };
    }

    return null;
  }

  // ── BRIDGE HELPERS ──────────────────────────────────────────────────
  // STATUS_DEFINITIONS uses different field names than what status-manager
  // originally expected. These helpers normalize the differences.

  // Does this status prevent actions? Handles both 'preventsAction' (singular,
  // used by STATUS_DEFINITIONS) and 'preventsActions' (plural, original format)
  function _preventsActions(def) {
    return !!(def.preventsActions || def.preventsAction);
  }

  // Does this status prevent movement?
  function _preventsMovement(def) {
    return !!(def.preventsMovement);
  }

  // Does this status prevent skill use (but allow basic attacks)?
  function _preventsSkills(def) {
    return !!(def.preventsSkills);
  }

  // Does this status prevent healing?
  function _preventsHealing(def) {
    return !!(def.preventsHealing);
  }

  // Is this status stackable?
  function _isStackable(def) {
    return !!(def.stacks || def.stackable);
  }

  // Get the break-on events. Bridges both 'breakOn' array format and
  // individual boolean flags (breaksOnDamage, breaksOnAction, etc.)
  function _getBreakEvents(def) {
    const events = [...(def.breakOn || [])];
    if (def.breaksOnDamage && !events.includes('damage'))       events.push('damage');
    if (def.breaksOnAction && !events.includes('action'))       events.push('action');
    if (def.breaksOnAllyDamage && !events.includes('ally_damage')) events.push('ally_damage');
    // breaksOnElement is handled separately in checkBreakConditions
    return events;
  }

  // Does this status have passive effects that affect stats?
  // Checks both explicit passiveEffects array AND inline stat modifiers.
  function _hasPassiveEffects(def) {
    if ((def.passiveEffects || []).length > 0) return true;
    if (def.statMod && Object.keys(def.statMod).length > 0) return true;
    if (def.drMod || def.moveMod || def.accuracyMod || def.critMod || def.damageMod) return true;
    return false;
  }

  // Does this status produce tick damage? Checks both tickEffects array
  // AND inline tickDamageType from STATUS_DEFINITIONS.
  function _hasTickDamage(def) {
    if ((def.tickEffects || []).length > 0) return true;
    if (def.tickDamageType) return true;
    return false;
  }

  // Does this status produce tick healing?
  function _hasTickHeal(def) {
    if (def.tickHeal) return true;
    return false;
  }

  // ── APPLY STATUS ──────────────────────────────────────────────────
  // args: { target, statusId, sourceUnit, overrides?, combatContext }
  // Returns: { applied: bool, reason?: string, instance?: {...} }
  function applyStatus(args) {
    const { target, statusId, sourceUnit, overrides, combatContext } = args;
    if (!target) return { applied: false, reason: 'no_target' };

    const def = _getStatusDef(statusId);
    if (!def) {
      // Not an error — the status may not be defined yet.
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
      if (_isStackable(def)) {
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

    // If this is a shield/barrier status, initialize absorbHP
    if (def.absorbHP) {
      instance.absorbHP = overrides?.absorbHP || overrides?.value || 0;
    }

    // If this is a DoT status, initialize tickDamageValue
    if (_hasTickDamage(def)) {
      instance.tickDamageValue = overrides?.tickDamageValue || overrides?.tickDamage || overrides?.value || 0;
    }

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
  //
  // DoT STACKING RULE: For same-element DoTs, only the highest damage
  // ticks. Different-element DoTs all tick independently.
  function tickStatuses(unit, phase) {
    if (!unit?.activeStatuses?.length) return;

    // Collect all DoT ticks by element to enforce highest-only rule
    const dotTicksByElement = {};  // { element: [{ statusId, damage, def, st }] }
    const healTicks = [];          // statuses that heal
    const otherTicks = [];         // statuses with explicit tickEffects

    // Iterate a copy (removals allowed during tick)
    const snapshot = [...unit.activeStatuses];
    for (const st of snapshot) {
      const def = _getStatusDef(st.statusId);
      if (!def) continue;
      if ((def.tickPhase || 'turn_start') !== phase) continue;

      // ── Handle explicit tickEffects (legacy/custom path) ──
      if ((def.tickEffects || []).length > 0) {
        otherTicks.push({ st, def });
      }
      // ── Handle inline tickDamageType (STATUS_DEFINITIONS path) ──
      else if (def.tickDamageType) {
        const element = def.tickDamageType;
        const baseDmg = st.tickDamageValue || st.overrides?.tickDamage || st.overrides?.value || 5;
        // DoTs do NOT multiply by stacks — they use highest per element
        if (!dotTicksByElement[element]) dotTicksByElement[element] = [];
        dotTicksByElement[element].push({
          statusId: st.statusId, damage: baseDmg, def, st
        });
      }
      // ── Handle inline tickHeal ──
      else if (def.tickHeal) {
        healTicks.push({ st, def });
      }

      // Decrement duration
      st.duration -= 1;
      if (st.duration <= 0) {
        removeStatus(unit, st.statusId, 'expired');
      }
    }

    // ── Execute DoT ticks: highest damage per element only ──
    for (const [element, ticks] of Object.entries(dotTicksByElement)) {
      // Sort by damage descending, take highest
      ticks.sort((a, b) => b.damage - a.damage);
      const highest = ticks[0];

      DC().applyTickDamage({
        source: null, target: unit, amount: highest.damage,
        element: element,
        damageType: _elementToDamageType(element),
        statusId: highest.statusId
      });
    }

    // ── Execute heal ticks ──
    for (const { st, def } of healTicks) {
      const healAmount = st.overrides?.tickHeal || st.overrides?.value || 5;
      DC().applyHeal({
        actor: null, target: unit, amount: healAmount,
        source: `status_${st.statusId}`
      });
    }

    // ── Execute explicit tickEffects (original path) ──
    for (const { st, def } of otherTicks) {
      for (const ref of (def.tickEffects || [])) {
        _fireTickEffect(unit, st, def, ref);
      }
    }
  }

  // Map element names to damage types for DoT
  function _elementToDamageType(element) {
    if (!element) return 'Physical';
    if (element === 'Physical') return 'Physical';
    if (element === 'Chaos') return 'Chaos';
    return 'Magic'; // Fire, Water, Lightning, etc. are all magic-type
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

    const def = _getStatusDef(statusId);

    // ── KILL ON EXPIRE (doom, etc.) ──
    if (reason === 'expired' && def?.killOnExpire) {
      unit.activeStatuses.splice(idx, 1);
      Log().logStatusRemoved({ target: unit, statusId, reason: 'expired_kill' });

      // Kill the unit
      unit.currentHP = 0;
      Log().record({
        type: 'kill', actor: null, target: unit,
        tags: ['kill', 'death', 'doom', `status_${statusId}`],
        data: { statusId, reason: 'killOnExpire' },
        message: `${unit.name || statusId} was killed by ${def.name || statusId} expiring!`
      });

      if (def && _hasPassiveEffects(def)) _requestRecompile(unit);
      return true;
    }

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
      const def = _getStatusDef(st.statusId);
      if (!def) continue;

      if (statusIds && !statusIds.includes(st.statusId)) continue;
      if (category  && def.category !== category) continue;
      if (element   && def.element  !== element)  continue;
      if (isBuffsOnly   && !_isBuff(def)) continue;
      if (isDebuffsOnly &&  _isBuff(def)) continue;

      toRemove.push(st.statusId);
    }

    for (const id of toRemove) removeStatus(unit, id, 'cleansed');
    return toRemove.length;
  }

  function _isBuff(def) {
    if (def.isBuff !== undefined) return def.isBuff;
    return def.category === 'buff';
  }

  // ── BREAK CONDITIONS ──────────────────────────────────────────────
  // Called by combat-manager after damage events, ally damage, etc.
  // event: 'damage' | 'ally_damage' | 'action' | 'move' | 'turn_start'
  // damageElement: optional element of the damage that caused the break check
  function checkBreakConditions(unit, event, damageElement) {
    if (!unit?.activeStatuses?.length) return;
    const snapshot = [...unit.activeStatuses];
    for (const st of snapshot) {
      const def = _getStatusDef(st.statusId);
      if (!def) continue;

      const breakEvents = _getBreakEvents(def);

      // Standard break events
      if (breakEvents.includes(event)) {
        removeStatus(unit, st.statusId, `broken_on_${event}`);
        continue;
      }

      // Element-specific break (e.g., web breaks on fire damage)
      if (event === 'damage' && def.breaksOnElement && damageElement === def.breaksOnElement) {
        removeStatus(unit, st.statusId, `broken_on_${damageElement}_damage`);
      }
    }
  }

  // ── ABSORB SHIELD MANAGEMENT ──────────────────────────────────────
  // Returns total absorb HP available. Called by damage-calc before HP reduction.
  function getAbsorbShield(unit) {
    if (!unit?.activeStatuses) return 0;
    let total = 0;
    for (const st of unit.activeStatuses) {
      if (st.absorbHP && st.absorbHP > 0) {
        total += st.absorbHP;
      }
    }
    return total;
  }

  // Reduce absorb shields by damage amount. Returns remaining damage after absorb.
  // Removes depleted shield statuses.
  function absorbDamage(unit, damage, damageType) {
    if (!unit?.activeStatuses || damage <= 0) return damage;
    let remaining = damage;

    const snapshot = [...unit.activeStatuses];
    for (const st of snapshot) {
      if (remaining <= 0) break;
      if (!st.absorbHP || st.absorbHP <= 0) continue;

      const def = _getStatusDef(st.statusId);
      // If barrier, only absorbs specific damage types
      if (def?.absorbType && damageType && def.absorbType !== damageType) {
        continue;
      }

      const absorbed = Math.min(st.absorbHP, remaining);
      st.absorbHP -= absorbed;
      remaining -= absorbed;

      if (st.absorbHP <= 0) {
        removeStatus(unit, st.statusId, 'shield_depleted');
      }
    }

    return remaining;
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
      const def = _getStatusDef(st.statusId);
      if (def && predicate(def, st)) return true;
    }
    return false;
  }

  // Is this unit action-disabled (stun, freeze, sleep, petrify)?
  function canAct(unit) {
    return !hasAnyStatusWith(unit, (def) => _preventsActions(def));
  }

  // Can this unit move?
  function canMove(unit) {
    return !hasAnyStatusWith(unit, (def) => _preventsActions(def) || _preventsMovement(def));
  }

  // Can this unit use skills? (blocked by silence)
  function canUseSkills(unit) {
    if (!canAct(unit)) return false;
    return !hasAnyStatusWith(unit, (def) => _preventsSkills(def));
  }

  // Can this unit be healed? (blocked by curse/preventsHealing)
  function canBeHealed(unit) {
    return !hasAnyStatusWith(unit, (def) => _preventsHealing(def));
  }

  // Does this unit have stealth/invisible?
  function isInvisible(unit) {
    return hasAnyStatusWith(unit, (def) => def.invisible);
  }

  // Get forced target info (for taunt/charm)
  function getForcedTarget(unit) {
    for (const st of (unit?.activeStatuses || [])) {
      const def = _getStatusDef(st.statusId);
      if (def?.forcedTarget) {
        return { type: def.forcedTarget, sourceUnitId: st.sourceUnitId, statusId: st.statusId };
      }
    }
    return null;
  }

  // Does this unit have randomized targeting? (confuse)
  function hasRandomTarget(unit) {
    return hasAnyStatusWith(unit, (def) => def.randomTarget);
  }

  // Does this unit have auto-counter? (counter stance)
  function hasAutoCounter(unit) {
    return hasAnyStatusWith(unit, (def) => def.autoCounter);
  }

  function getActiveStatusesByCategory(unit) {
    const grouped = {};
    for (const st of (unit?.activeStatuses || [])) {
      const def = _getStatusDef(st.statusId);
      const cat = def?.category || 'unknown';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ ...st, definition: def });
    }
    return grouped;
  }

  // ── INTERNAL HELPERS ──────────────────────────────────────────────
  function _isImmune(unit, statusDef) {
    // Check element immunity (burn is fire, freeze is water, etc.)
    const element = statusDef.element || statusDef.tickDamageType;
    if (element && (unit.immune || []).includes(element)) {
      return true;
    }
    // Check statusImmunities list
    if ((unit.statusImmunities || []).includes(statusDef.id)) return true;
    return false;
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

  // Expose _getStatusDef for other modules that need dual lookup
  // (e.g., stat-compiler, combat-ui)
  function getStatusDef(statusId) {
    return _getStatusDef(statusId);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    applyStatus, removeStatus, cleanse,
    tickStatuses, checkBreakConditions,
    hasStatus, getStatus, getStatusStacks, hasAnyStatusWith,
    canAct, canMove, canUseSkills, canBeHealed,
    isInvisible, getForcedTarget, hasRandomTarget, hasAutoCounter,
    getActiveStatusesByCategory,
    getAbsorbShield, absorbDamage,
    processRecompileRequests,
    getStatusDef
  });
})();
