// campaign-world-events.js
// Rotating timed world events. Ticks on phase pass; exposes modifier getters
// that other systems (inventory, farming, shops, fishing, encounters) read at
// resolve time. Event definitions live in DataStore.worldEvents.
//
// Lifecycle:
//   onPhasePass → tick() → expires active events whose remaining hits 0, then
//   maybe spawns a new one (rolls against spawn.weight). Cooldown is tracked
//   per-event in state.worldEvents.cooldowns to avoid back-to-back repeats.
//
// State shape (lives on the save):
//   state.worldEvents = {
//     active:    [{ id, name, icon, summary, modifiers, remainingPhases, startedAtPhase, category }],
//     history:   [{ id, name, icon, startedAtPhase, endedAtPhase, reason }],
//     cooldowns: { [eventId]: phaseAvailableAt }
//   }
//
// Reads: DataStore.worldEvents, CampaignState
// Used by: campaign-ops (passPhase tick), inventory/farm/shop modifiers,
//          fishing minigame, encounter biasing.

window.CJS = window.CJS || {};

window.CJS.CampaignWorldEvents = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;

  // Maximum simultaneous active events. Prevents a flood of buffs/threats
  // stacking forever.
  const MAX_ACTIVE = 3;
  // Chance per phase to roll a new event if cap not reached.
  const SPAWN_CHANCE = 0.35;

  /** Ensures the live state has a worldEvents bucket. Returns a reference. */
  function _ensureBucket(state) {
    state.worldEvents = state.worldEvents || { active: [], history: [], cooldowns: {} };
    state.worldEvents.active = state.worldEvents.active || [];
    state.worldEvents.history = state.worldEvents.history || [];
    state.worldEvents.cooldowns = state.worldEvents.cooldowns || {};
    return state.worldEvents;
  }

  /** Snapshot read of active events. Empty array if none. */
  function getActive() {
    const state = CS()?.getState?.();
    return state?.worldEvents?.active ? [...state.worldEvents.active] : [];
  }

  /** History of past events (most recent first). */
  function getHistory() {
    const state = CS()?.getState?.();
    return state?.worldEvents?.history ? [...state.worldEvents.history] : [];
  }

  /** All authored event templates, sorted by name. */
  function getCatalog() {
    return DS()?.getAllAsArray?.('worldEvents') || [];
  }

  // ── Modifier accessors. Other modules call these at resolve time. ──

  /**
   * @param {'items'|'materials'|'food'|'questItems'} bucket
   * @returns {number} multiplier (default 1.0)
   */
  function getDropMultiplier(bucket) {
    let mult = 1.0;
    for (const ev of getActive()) {
      const dm = ev.modifiers?.dropMultiplier;
      if (!dm) continue;
      // Either a per-bucket map or a single flat number applied to all buckets.
      if (typeof dm === 'number') mult *= dm;
      else if (dm[bucket]) mult *= Number(dm[bucket] || 1);
    }
    return mult;
  }

  /** @returns {number} farm growth multiplier (default 1.0) */
  function getFarmGrowthMultiplier() {
    let mult = 1.0;
    for (const ev of getActive()) {
      const v = Number(ev.modifiers?.farmGrowthMultiplier || 0);
      if (v > 0) mult *= v;
    }
    return mult;
  }

  /** @returns {number} fractional shop discount in [0, 0.9]. 0 = no discount. */
  function getShopDiscount() {
    let bestDiscount = 0;
    for (const ev of getActive()) {
      const d = Number(ev.modifiers?.shopDiscount || 0);
      if (d > bestDiscount) bestDiscount = d;
    }
    return Math.max(0, Math.min(0.9, bestDiscount));
  }

  /** @returns {number} flat danger bonus added to scenario danger ratings. */
  function getDangerBonus() {
    let bonus = 0;
    for (const ev of getActive()) {
      bonus += Number(ev.modifiers?.dangerBonus || 0);
    }
    return bonus;
  }

  /** @returns {number} fishing rate / catch quality multiplier. */
  function getFishingBonus() {
    let mult = 1.0;
    for (const ev of getActive()) {
      const v = Number(ev.modifiers?.fishingBonus || 0);
      if (v > 0) mult *= v;
    }
    return mult;
  }

  /** @returns {number} XP multiplier on combat rewards. */
  function getXpMultiplier() {
    let mult = 1.0;
    for (const ev of getActive()) {
      const v = Number(ev.modifiers?.xpMultiplier || 0);
      if (v > 0) mult *= v;
    }
    return mult;
  }

  /**
   * Encounter biasing — encounter selection systems can give bonus weight
   * to entries whose tags overlap with active event bias tags.
   * @returns {Array<{ tags: string[], weight: number }>}
   */
  function getEncounterBias() {
    const biases = [];
    for (const ev of getActive()) {
      const bias = ev.modifiers?.encounterBias;
      if (!bias) continue;
      biases.push({
        tags: (bias.tags || []).map((t) => String(t).toLowerCase()),
        weight: Number(bias.weight || 1)
      });
    }
    return biases;
  }

  /** Combined summary used by UI badges. */
  function getSummary() {
    const active = getActive();
    if (!active.length) return null;
    return {
      count: active.length,
      events: active.map((ev) => ({
        id: ev.id,
        name: ev.name,
        icon: ev.icon,
        summary: ev.summary,
        remainingPhases: ev.remainingPhases,
        category: ev.category || 'boon'
      }))
    };
  }

  // ── Mutators. Called from campaign-ops on phase pass / manual triggers. ──

  /**
   * Start a specific event by id. Returns the active record or null on failure.
   * Used by ops and dev console.
   */
  function start(eventId, options = {}) {
    const def = DS()?.get?.('worldEvents', eventId);
    if (!def) return null;
    /** @type {any} */
    let started = null;
    CS().mutate((state) => {
      const bucket = _ensureBucket(state);
      // Don't duplicate. If already active, refresh remaining phases instead.
      const existing = bucket.active.find((ev) => ev.id === eventId);
      if (existing) {
        existing.remainingPhases = options.durationPhases || def.durationPhases || existing.remainingPhases;
        return;
      }
      // Respect MAX_ACTIVE.
      if (bucket.active.length >= MAX_ACTIVE) {
        // Bump the oldest to history with reason 'displaced'.
        const old = bucket.active.shift();
        bucket.history.unshift({
          id: old.id, name: old.name, icon: old.icon,
          startedAtPhase: old.startedAtPhase,
          endedAtPhase: state.phase?.number || 1,
          reason: 'displaced'
        });
      }
      started = {
        id: def.id,
        name: def.name || def.id,
        icon: def.icon || '✨',
        summary: def.summary || '',
        category: def.category || 'boon',
        modifiers: def.modifiers || {},
        durationPhases: Number(options.durationPhases || def.durationPhases || 3),
        remainingPhases: Number(options.durationPhases || def.durationPhases || 3),
        startedAtPhase: state.phase?.number || 1,
        tags: [...(def.tags || [])]
      };
      bucket.active.push(started);
      // Lock cooldown so the same event doesn't fire again immediately.
      bucket.cooldowns[eventId] = (state.phase?.number || 1) + (def.spawn?.cooldownPhases || 4) + Number(options.durationPhases || def.durationPhases || 3);
    }, { source: 'world_event_start' });
    if (started) {
      window.CJS.CampaignOps?.apply?.({ op: 'log', text: `World event begins: ${started.icon || ''} ${started.name} — ${started.summary}` }, { source: 'world_event_start' });
    }
    return started;
  }

  /** End an event prematurely. */
  function end(eventId, reason = 'manual') {
    /** @type {any} */
    let ended = null;
    CS().mutate((state) => {
      const bucket = _ensureBucket(state);
      const idx = bucket.active.findIndex((ev) => ev.id === eventId);
      if (idx < 0) return;
      const removed = bucket.active.splice(idx, 1)[0];
      ended = removed;
      bucket.history.unshift({
        id: removed.id,
        name: removed.name,
        icon: removed.icon,
        startedAtPhase: removed.startedAtPhase,
        endedAtPhase: state.phase?.number || 1,
        reason
      });
    }, { source: 'world_event_end' });
    if (ended) {
      window.CJS.CampaignOps?.apply?.({ op: 'log', text: `World event ends: ${ended.name}.` }, { source: 'world_event_end' });
    }
    return ended;
  }

  /**
   * Called each phase pass. Ticks down active events, expires any that
   * complete, then maybe spawns a new one based on weighted catalog.
   */
  function onPhasePass(state) {
    if (!state) return [];
    const bucket = _ensureBucket(state);
    const expired = [];
    for (const ev of [...bucket.active]) {
      ev.remainingPhases = Math.max(0, (ev.remainingPhases || 0) - 1);
      if (ev.remainingPhases <= 0) {
        const idx = bucket.active.indexOf(ev);
        if (idx >= 0) bucket.active.splice(idx, 1);
        bucket.history.unshift({
          id: ev.id, name: ev.name, icon: ev.icon,
          startedAtPhase: ev.startedAtPhase,
          endedAtPhase: state.phase?.number || 1,
          reason: 'expired'
        });
        expired.push(ev);
      }
    }
    // Spawn roll
    if (bucket.active.length < MAX_ACTIVE && Math.random() < SPAWN_CHANCE) {
      _maybeSpawn(state, bucket);
    }
    // Keep history bounded.
    if (bucket.history.length > 40) bucket.history.length = 40;
    return expired;
  }

  function _maybeSpawn(state, bucket) {
    const catalog = getCatalog();
    if (!catalog.length) return null;
    const phase = state.phase?.number || 1;
    const activeIds = new Set(bucket.active.map((ev) => ev.id));
    const pool = catalog.filter((def) => {
      if (activeIds.has(def.id)) return false;
      const cd = bucket.cooldowns?.[def.id] || 0;
      if (cd > phase) return false;
      return true;
    });
    if (!pool.length) return null;
    const totalWeight = pool.reduce((sum, def) => sum + Math.max(1, Number(def.spawn?.weight || 1)), 0);
    let cursor = Math.random() * totalWeight;
    let pick = pool[pool.length - 1];
    for (const def of pool) {
      cursor -= Math.max(1, Number(def.spawn?.weight || 1));
      if (cursor <= 0) { pick = def; break; }
    }
    return start(pick.id);
  }

  return Object.freeze({
    getActive,
    getHistory,
    getCatalog,
    getDropMultiplier,
    getFarmGrowthMultiplier,
    getShopDiscount,
    getDangerBonus,
    getFishingBonus,
    getXpMultiplier,
    getEncounterBias,
    getSummary,
    start,
    end,
    onPhasePass,
    MAX_ACTIVE
  });
})();
