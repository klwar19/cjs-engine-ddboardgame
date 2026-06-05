// status-manager.ts — Tier 3 TS port of js/combat/status-manager.js (engine
// cluster: combat). Tracks active statuses on all units: apply, stack, tick,
// expire, cleanse, immunity, break-on-damage, absorb shields, and recompile
// requests. DUAL LOOKUP: DataStore 'statuses' first, then CONST.STATUS_DEFINITIONS.
// DoT stacking: same-element DoTs keep the highest tick; different elements tick
// independently.
//
// Reads: window.CJS DataStore/StatCompiler/DamageCalc/CombatLog/ValueCalc/CONST/
// AudioManager/Weather/CombatManager/EffectResolver.
// Used by: effect-resolver (status_apply), combat-manager (tick).
//
// Exports `StatusManager`; installs window.CJS.StatusManager via one documented
// cast — the historical CJSStatusManager interface declares getForcedTarget as
// returning string|null, but it has always returned an object|null. The runtime
// object is unchanged. Bodies verbatim.

const DS  = () => window.CJS.DataStore;
const SC  = (): any => window.CJS.StatCompiler;
const DC  = (): any => window.CJS.DamageCalc;
const Log = () => window.CJS.CombatLog;
const VC  = () => window.CJS.ValueCalc;
const C   = () => window.CJS.CONST;
const AM  = () => (window.CJS as any).AudioManager;

// ── DUAL LOOKUP ─────────────────────────────────────────────────────
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
function _preventsActions(def) {
  return !!(def.preventsActions || def.preventsAction);
}

function _preventsMovement(def) {
  return !!(def.preventsMovement);
}

function _preventsSkills(def) {
  return !!(def.preventsSkills);
}

function _preventsHealing(def) {
  return !!(def.preventsHealing);
}

function _isStackable(def) {
  return !!(def.stacks || def.stackable);
}

function _getBreakEvents(def) {
  const events = [...(def.breakOn || [])];
  if (def.breaksOnDamage && !events.includes('damage'))       events.push('damage');
  if (def.breaksOnAction && !events.includes('action'))       events.push('action');
  if (def.breaksOnAllyDamage && !events.includes('ally_damage')) events.push('ally_damage');
  // breaksOnElement is handled separately in checkBreakConditions
  return events;
}

function _hasPassiveEffects(def) {
  if ((def.passiveEffects || []).length > 0) return true;
  if (def.statMod && Object.keys(def.statMod).length > 0) return true;
  if (def.drMod || def.moveMod || def.accuracyMod || def.critMod || def.damageMod) return true;
  return false;
}

function _hasTickDamage(def) {
  if ((def.tickEffects || []).length > 0) return true;
  if (def.tickDamageType) return true;
  return false;
}

function _hasTickHeal(def) {
  if (def.tickHeal) return true;
  return false;
}

// ── APPLY STATUS ──────────────────────────────────────────────────
function applyStatus(args) {
  const { target, statusId, sourceUnit, overrides, combatContext } = args;
  if (!target) return { applied: false, reason: 'no_target' };

  const def = _getStatusDef(statusId);
  if (!def) {
    // Not an error — the status may not be defined yet.
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

  let newDuration = overrides?.duration ?? def.duration ?? 3;
  // Apply weather-aware duration adjustment.
  const WX: any = (window.CJS as any).Weather;
  const CM: any = window.CJS.CombatManager;
  if (WX && CM) {
    const env = CM.getEnvironment ? CM.getEnvironment() : null;
    if (env && env.id !== 'normal') {
      newDuration = WX.modifyStatusDuration(statusId, newDuration, { environment: env });
    }
  }
  if (newDuration <= 0) {
    // Weather completely nullified the status application
    Log().record({
      type: 'status_resisted', actor: sourceUnit, target,
      tags: ['status_resisted', `status_${statusId}`, 'weather_nullified'],
      data: { statusId, reason: 'weather_nullified' }
    });
    return { applied: false, reason: 'weather_nullified' };
  }
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
    if (_isBuff(def)) _playBattleSfx(target, 'happy', 0.44);
    return { applied: true, instance: existing, refreshed: true };
  }

  // Fresh application
  const instance: any = {
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

  // Ultimate hack: arm one-shot damage negation when the dedicated status lands.
  if (statusId === 'negate_next_damage') target.nextDamageNegated = true;

  Log().logStatusApplied({
    actor: sourceUnit, target, statusId,
    duration: instance.duration, stacks: instance.stacks
  });

  if (_hasPassiveEffects(def)) _requestRecompile(target);

  // Fire on_status_applied trigger (if effect-resolver is available)
  const Resolver: any = (window.CJS as any).EffectResolver;
  if (Resolver) {
    Resolver.fireTrigger('on_status_applied', {
      unit: target, target, attacker: sourceUnit,
      statusId, ...combatContext
    });
  }

  try { (window.CJS as any).AudioManager?.playSfx('status_apply'); } catch (e) {}
  if (_isBuff(def)) _playBattleSfx(target, 'happy', 0.44);

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
function tickStatuses(unit, phase) {
  if (!unit?.activeStatuses?.length) return;

  // Collect all DoT ticks by element to enforce highest-only rule
  const dotTicksByElement: Record<string, any[]> = {};
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
function removeStatus(unit, statusId, reason?) {
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

function _playBattleSfx(unit, event, volume) {
  const key = _battleSfxKey(unit, event);
  if (!key) return;
  try { AM()?.playSfx(key, { volume }); } catch (e) {}
}

function _battleSfxKey(unit, event) {
  const slots = unit?.battleSfx || {};
  const aliases = {
    happy: ['happy', 'happyLine', 'voiceHappy']
  }[event] || [event];
  for (const alias of aliases) {
    const picked = _pickSfxValue(slots[alias]);
    if (picked) return picked;
  }
  return '';
}

function _pickSfxValue(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    const options = value.map((item) => String(item || '').trim()).filter(Boolean);
    return options.length ? options[Math.floor(Math.random() * options.length)] : '';
  }
  if (value && typeof value === 'object') return _pickSfxValue(value.id || value.key || value.sfx);
  return '';
}

// ── BREAK CONDITIONS ──────────────────────────────────────────────
function checkBreakConditions(unit, event, damageElement?) {
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

function absorbDamage(unit, damage, damageType?) {
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
  const grouped: Record<string, any[]> = {};
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

// Flag a unit for stat-compiler recompile.
function _requestRecompile(unit) {
  unit._needsRecompile = true;
}

function _idOf(u) {
  if (!u) return null;
  return typeof u === 'string' ? u : (u.instanceId || u.baseId || u.id || null);
}

// Called by combat-manager at phase boundaries to process recompile requests.
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
function getStatusDef(statusId) {
  return _getStatusDef(statusId);
}

// ── PUBLIC API ─────────────────────────────────────────────────────
export const StatusManager = Object.freeze({
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

// Runtime compatibility install — keep window.CJS.StatusManager identical to the
// legacy IIFE. The cast bridges the historical CJSStatusManager interface, which
// types getForcedTarget as string|null though it returns an object|null.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.StatusManager = StatusManager as unknown as CJSStatusManager;
