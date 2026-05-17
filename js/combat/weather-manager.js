// weather-manager.js
// Global battlefield environment ("weather"). Lives on combat-manager
// _state.environment and applies four kinds of effect:
//   1. Elemental damage multipliers (damage-calc consults applyDamageMods)
//   2. Stat modifiers merged into compiled units (stat-compiler)
//   3. Periodic ticks (this module's tickEnvironment runs at turn_end)
//   4. Status-duration adjustments (status-manager calls modifyStatusDuration)
//
// State shape on _state.environment:
//   { id, remaining, sourceUnitId, appliedRound }
//
// Reads: data-store, combat-log, damage-calc
// Used by: combat-manager (tick), damage-calc (damage mods), stat-compiler
//          (stat mods), status-manager (duration mods), effect-resolver
//          (environment_set / environment_clear actions)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.Weather = (() => {
  'use strict';

  const DS  = () => window.CJS.DataStore;
  const Log = () => window.CJS.CombatLog;
  const DC  = () => window.CJS.DamageCalc;

  const DEFAULT_ID = 'normal';

  function getDef(weatherId) {
    if (!weatherId || weatherId === DEFAULT_ID) {
      return DS()?.get?.('weathers', DEFAULT_ID) || {
        id: DEFAULT_ID, name: 'Clear', icon: '☀️',
        damageMods: {}, statMods: {}, tick: null,
        statusInteractions: [], immuneTags: []
      };
    }
    return DS()?.get?.('weathers', weatherId) || null;
  }

  function getActive(state) {
    const id = state?.environment?.id || DEFAULT_ID;
    return getDef(id);
  }

  function initEnvironment(state, roundNumber = 1) {
    if (!state) return;
    state.environment = {
      id: DEFAULT_ID,
      remaining: 0,
      sourceUnitId: null,
      appliedRound: roundNumber
    };
  }

  function setEnvironment(state, weatherId, duration, sourceUnitId) {
    if (!state) return null;
    const def = getDef(weatherId);
    if (!def) return null;
    state.environment = state.environment || {};
    state.environment.id = def.id;
    state.environment.remaining = Math.max(0, Number(duration) || 0);
    state.environment.sourceUnitId = sourceUnitId || null;
    state.environment.appliedRound = state.roundNumber || 1;
    try { Log()?.record?.({ type: 'weather_change', tags: ['weather'], data: { id: def.id, duration: state.environment.remaining } }); } catch (e) {}
    return def;
  }

  function clearEnvironment(state) {
    if (!state?.environment) return;
    state.environment.id = DEFAULT_ID;
    state.environment.remaining = 0;
    state.environment.sourceUnitId = null;
    try { Log()?.record?.({ type: 'weather_change', tags: ['weather'], data: { id: DEFAULT_ID, duration: 0 } }); } catch (e) {}
  }

  // Decrement remaining duration. If reaches 0, revert to normal.
  function tickEnvironment(state) {
    if (!state?.environment) return;
    const env = state.environment;
    if (env.id === DEFAULT_ID || env.remaining <= 0) return;

    const def = getDef(env.id);
    if (def?.tick) _applyPeriodicTick(state, def);

    env.remaining = Math.max(0, env.remaining - 1);
    if (env.remaining === 0) clearEnvironment(state);
  }

  function _applyPeriodicTick(state, def) {
    const tick = def.tick;
    if (!tick || typeof tick !== 'object') return;
    const amount = Number(tick.amount || 0);
    if (amount === 0) return;
    const units = Object.values(state.units || {});
    const targets = units.filter((u) => _unitMatchesTickFilter(u, tick, def));
    const dc = DC();
    for (const target of targets) {
      if ((target.currentHP || 0) <= 0) continue;
      if (amount > 0) {
        if (dc?.applyRawDamage) {
          dc.applyRawDamage({
            source: null, target, amount,
            reason: `weather_${def.id}`,
            damageType: tick.damageType || 'True',
            element: tick.element || null
          });
        } else {
          target.currentHP = Math.max(0, (target.currentHP || 0) - amount);
        }
      } else {
        // Negative amount = heal
        const heal = -amount;
        target.currentHP = Math.min(target.maxHP || target.currentHP, (target.currentHP || 0) + heal);
      }
    }
  }

  function _unitMatchesTickFilter(unit, tick, def) {
    if (!unit) return false;
    const teams = tick.targetTeams || ['all'];
    const teamOk = teams.includes('all') || teams.includes(unit.team);
    if (!teamOk) return false;
    if (_unitImmune(unit, def)) return false;
    if (Array.isArray(tick.tagsOnly) && tick.tagsOnly.length) {
      const utags = _unitTags(unit);
      if (!tick.tagsOnly.some((t) => utags.includes(t))) return false;
    }
    return true;
  }

  function _unitTags(unit) {
    const tags = [];
    if (unit.type) tags.push(String(unit.type).toLowerCase());
    if (Array.isArray(unit.tags)) for (const t of unit.tags) tags.push(String(t).toLowerCase());
    return tags;
  }

  function _unitImmune(unit, def) {
    const immune = def.immuneTags || [];
    if (!immune.length) return false;
    const utags = _unitTags(unit);
    return immune.some((t) => utags.includes(String(t).toLowerCase()));
  }

  // Multiplies an element's damage based on active weather.
  // Returns a finite positive number (default 1).
  function applyDamageMods(element, state) {
    const def = getActive(state);
    if (!def || !def.damageMods) return 1;
    const mult = def.damageMods[element];
    return Number.isFinite(mult) && mult > 0 ? mult : 1;
  }

  // Returns a flat-merge of weather stat mods for the current weather.
  // Keys like accuracyBonus / evasionBonus / damagePercent ride on the
  // same names stat-compiler already uses.
  function getStatMods(state) {
    const def = getActive(state);
    return (def && def.statMods) ? { ...def.statMods } : {};
  }

  // Merge weather stat mods onto a compiled unit. Idempotent: removes any
  // previously-stamped weather mods (tracked via __weatherStamp) first so
  // re-applying after weather change won't double-stack.
  function applyStatModsToUnit(unit, state) {
    if (!unit) return;
    // Undo prior stamp
    const prev = unit.__weatherStamp;
    if (prev) {
      for (const key of Object.keys(prev)) {
        if (typeof unit[key] === 'number') unit[key] -= prev[key];
      }
      unit.__weatherStamp = null;
    }
    const def = getActive(state);
    if (!def || _unitImmune(unit, def)) return;
    const mods = def.statMods || {};
    const stamp = {};
    for (const [key, value] of Object.entries(mods)) {
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      if (typeof unit[key] === 'number') {
        unit[key] += num;
      } else {
        unit[key] = num;
      }
      stamp[key] = num;
    }
    unit.__weatherStamp = stamp;
  }

  // Adjust a status duration based on weather interactions.
  // Used by StatusManager.applyStatus before storing the new instance.
  function modifyStatusDuration(statusId, baseDuration, state) {
    const def = getActive(state);
    if (!def?.statusInteractions?.length) return baseDuration;
    const interactions = def.statusInteractions;
    let delta = 0;
    for (const i of interactions) {
      if (i.statusId === statusId) delta += Number(i.extendDuration || 0);
    }
    if (!delta) return baseDuration;
    return Math.max(0, Number(baseDuration || 0) + delta);
  }

  return {
    getDef,
    getActive,
    initEnvironment,
    setEnvironment,
    clearEnvironment,
    tickEnvironment,
    applyDamageMods,
    getStatMods,
    applyStatModsToUnit,
    modifyStatusDuration,
    DEFAULT_ID
  };
})();
