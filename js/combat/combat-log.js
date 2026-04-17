// combat-log.js
// Records every combat event with full context and narrator-ready tags.
// The log is the single source of truth for "what happened this turn" —
// both the combat UI and the narrator consume from it.
//
// Each entry has:
//   { id, turn, phase, type, actor, target, tags[], data, timestamp }
//
// Tags drive the narrator — e.g. ["hit", "crit", "element_exploit",
// "actor_bin", "streak_3", "skill_ember_slash"] tells the fragment picker
// exactly what flavour of quip to look for.
//
// Reads: nothing (pure recorder)
// Used by: effect-resolver, damage-calc, status-manager, combat-manager,
//          combat-ui, narrator-engine (Phase 5)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.CombatLog = (() => {
  'use strict';

  // ── STATE ──────────────────────────────────────────────────────────
  let _entries = [];
  let _nextId = 1;
  let _subscribers = [];  // functions called on each new entry
  let _currentTurn = 1;
  let _currentPhase = 'setup';  // 'setup' | 'turn_start' | 'action' | 'resolution' | 'turn_end'

  // ── CORE: RECORD ────────────────────────────────────────────────────
  // Entry types (guide — not enforced):
  //   hit, miss, crit, dodge, kill, death,
  //   damage, heal, mp_change,
  //   status_applied, status_removed, status_tick, status_expired, status_resisted,
  //   skill_used, item_used, move, teleport, knockback,
  //   terrain_effect, terrain_created,
  //   qte_result, turn_start, turn_end, battle_start, battle_end,
  //   effect_fired, note
  function record(entry) {
    const full = {
      id:        _nextId++,
      turn:      _currentTurn,
      phase:     _currentPhase,
      type:      entry.type || 'note',
      actor:     entry.actor || null,      // unit ref or id
      target:    entry.target || null,
      tags:      [...(entry.tags || [])],
      data:      entry.data || {},
      message:   entry.message || null,
      timestamp: Date.now()
    };

    // Auto-tags: always include actor/target identity tags if present
    _autoTag(full);

    _entries.push(full);

    // Notify subscribers (UI, narrator)
    for (const cb of _subscribers) {
      try { cb(full); } catch (e) { console.error('CombatLog subscriber error:', e); }
    }
    return full;
  }

  function _autoTag(entry) {
    entry.tags.push(`type_${entry.type}`);
    entry.tags.push(`phase_${entry.phase}`);

    const actorId = _idOf(entry.actor);
    if (actorId) entry.tags.push(`actor_${actorId}`);

    const targetId = _idOf(entry.target);
    if (targetId) entry.tags.push(`target_${targetId}`);

    // Team identity
    if (entry.actor?.team)  entry.tags.push(`actor_team_${entry.actor.team}`);
    if (entry.target?.team) entry.tags.push(`target_team_${entry.target.team}`);

    // Type identity (beast, dragon, etc.)
    if (entry.actor?.type)  entry.tags.push(`actor_type_${entry.actor.type}`);
    if (entry.target?.type) entry.tags.push(`target_type_${entry.target.type}`);

    // Rank identity
    if (entry.actor?.rank)  entry.tags.push(`actor_rank_${entry.actor.rank}`);
    if (entry.target?.rank) entry.tags.push(`target_rank_${entry.target.rank}`);
  }

  function _idOf(unitOrId) {
    if (!unitOrId) return null;
    if (typeof unitOrId === 'string') return unitOrId;
    return unitOrId.baseId || unitOrId.instanceId || unitOrId.id || null;
  }

  // ── PHASE / TURN TRACKING ──────────────────────────────────────────
  function setTurn(n) { _currentTurn = n; }
  function setPhase(p) { _currentPhase = p; }
  function getTurn() { return _currentTurn; }
  function getPhase() { return _currentPhase; }

  // ── CONVENIENCE RECORDERS ──────────────────────────────────────────
  // These shape the tag set consistently so the narrator gets clean input.

  function logHit({ actor, target, damage, element, damageType, skill, isCritical, qteGrade, breakdown }) {
    const tags = ['hit'];
    if (isCritical) tags.push('crit');
    if (element)    tags.push(`element_${element.toLowerCase()}`);
    if (damageType) tags.push(`damage_type_${damageType.toLowerCase()}`);
    if (skill?.id)  tags.push(`skill_${skill.id}`);
    if (qteGrade)   tags.push(`qte_${qteGrade}`);
    if (damage >= (target?.maxHP || 0) * 0.3) tags.push('big_hit');
    if (damage >= (target?.maxHP || 0) * 0.5) tags.push('massive_hit');
    return record({
      type: 'hit', actor, target, tags,
      data: { damage, element, damageType, skill: skill?.id, isCritical, qteGrade, breakdown }
    });
  }

  function logMiss({ actor, target, skill, reason }) {
    return record({
      type: 'miss', actor, target,
      tags: ['miss', reason ? `miss_${reason}` : 'miss_evaded'],
      data: { skill: skill?.id, reason }
    });
  }

  function logDodge({ actor, target, skill }) {
    return record({
      type: 'dodge', actor: target, target: actor,  // dodger is "actor" of the dodge event
      tags: ['dodge', 'miss'],
      data: { skill: skill?.id }
    });
  }

  function logKill({ actor, target, overkill, finalBlowSkill }) {
    const tags = ['kill', 'death'];
    if (overkill > 0) tags.push('overkill');
    if (actor?.currentHP / actor?.maxHP < 0.3) tags.push('comeback');
    if (finalBlowSkill?.id) tags.push(`skill_${finalBlowSkill.id}`);
    return record({
      type: 'kill', actor, target, tags,
      data: { overkill, finalBlowSkill: finalBlowSkill?.id }
    });
  }

  function logHeal({ actor, target, amount, source }) {
    return record({
      type: 'heal', actor, target,
      tags: ['heal', source ? `heal_${source}` : 'heal_direct'],
      data: { amount, source }
    });
  }

  function logStatusApplied({ actor, target, statusId, duration, stacks }) {
    return record({
      type: 'status_applied', actor, target,
      tags: ['status', 'status_applied', `status_${statusId}`],
      data: { statusId, duration, stacks }
    });
  }

  function logStatusRemoved({ target, statusId, reason }) {
    return record({
      type: 'status_removed', actor: null, target,
      tags: ['status', 'status_removed', `status_${statusId}`, `removed_${reason || 'cleared'}`],
      data: { statusId, reason }
    });
  }

  function logStatusTick({ target, statusId, effect, amount }) {
    return record({
      type: 'status_tick', actor: null, target,
      tags: ['status', 'status_tick', `status_${statusId}`],
      data: { statusId, effect, amount }
    });
  }

  function logMove({ actor, from, to, cost, terrainEffects }) {
    const tags = ['move'];
    if (terrainEffects?.length) tags.push('move_through_terrain');
    return record({
      type: 'move', actor, target: null, tags,
      data: { from, to, cost, terrainEffects: terrainEffects || [] }
    });
  }

  function logKnockback({ actor, target, distance, collisions }) {
    const tags = ['knockback'];
    if (collisions?.some(c => c.type === 'wall')) tags.push('knockback_wall');
    if (collisions?.some(c => c.type === 'unit')) tags.push('knockback_unit');
    return record({
      type: 'knockback', actor, target, tags,
      data: { distance, collisions: collisions || [] }
    });
  }

  function logSkillUse({ actor, target, skill, apCost, mpCost }) {
    return record({
      type: 'skill_used', actor, target,
      tags: ['skill_used', `skill_${skill.id}`],
      data: { skill: skill.id, apCost, mpCost }
    });
  }

  function logEffect({ actor, target, effect, result }) {
    return record({
      type: 'effect_fired', actor, target,
      tags: ['effect', `effect_${effect.id || effect.action}`, `trigger_${effect.trigger}`],
      data: { effectId: effect.id, action: effect.action, trigger: effect.trigger, result }
    });
  }

  function logQTE({ actor, skill, qteType, grade, multiplier }) {
    return record({
      type: 'qte_result', actor, target: null,
      tags: ['qte', `qte_${qteType}`, `qte_${grade}`],
      data: { qteType, grade, multiplier, skill: skill?.id }
    });
  }

  function logTurnStart(actor) {
    return record({
      type: 'turn_start', actor, target: null,
      tags: ['turn_start'],
      data: { turn: _currentTurn }
    });
  }

  function logTurnEnd(actor) {
    return record({
      type: 'turn_end', actor, target: null,
      tags: ['turn_end'],
      data: { turn: _currentTurn }
    });
  }

  function logBattleStart(units) {
    return record({
      type: 'battle_start', actor: null, target: null,
      tags: ['battle_start'],
      data: { unitCount: units?.length || 0 }
    });
  }

  function logBattleEnd({ winner, reason }) {
    return record({
      type: 'battle_end', actor: null, target: null,
      tags: ['battle_end', `winner_${winner}`],
      data: { winner, reason }
    });
  }

  function logNote(message, extraTags) {
    return record({
      type: 'note', actor: null, target: null,
      tags: ['note', ...(extraTags || [])],
      message
    });
  }

  // ── QUERIES ────────────────────────────────────────────────────────
  function getAll() { return [..._entries]; }
  function getLast(n) { return _entries.slice(-n); }
  function getLastEntry() { return _entries[_entries.length - 1] || null; }
  function getByTurn(t) { return _entries.filter(e => e.turn === t); }

  function getByActor(unitOrId) {
    const id = _idOf(unitOrId);
    return _entries.filter(e => _idOf(e.actor) === id);
  }

  function getByTarget(unitOrId) {
    const id = _idOf(unitOrId);
    return _entries.filter(e => _idOf(e.target) === id);
  }

  function getByType(type) {
    return _entries.filter(e => e.type === type);
  }

  function getByTag(tag) {
    return _entries.filter(e => e.tags.includes(tag));
  }

  // Get all entries since entry id X (for narrator catching up on new events)
  function getSince(id) {
    return _entries.filter(e => e.id > id);
  }

  // ── SUBSCRIPTIONS ──────────────────────────────────────────────────
  function subscribe(fn) {
    _subscribers.push(fn);
    return () => {
      const i = _subscribers.indexOf(fn);
      if (i >= 0) _subscribers.splice(i, 1);
    };
  }

  // ── RESET (new combat) ─────────────────────────────────────────────
  function reset() {
    _entries = [];
    _nextId = 1;
    _currentTurn = 1;
    _currentPhase = 'setup';
  }

  // ── STATS / SUMMARY ────────────────────────────────────────────────
  function summary() {
    const byType = {};
    for (const e of _entries) byType[e.type] = (byType[e.type] || 0) + 1;
    return {
      totalEntries: _entries.length,
      turns:        _currentTurn,
      byType
    };
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    // Generic
    record,
    // Shaped recorders
    logHit, logMiss, logDodge, logKill, logHeal,
    logStatusApplied, logStatusRemoved, logStatusTick,
    logMove, logKnockback, logSkillUse, logEffect, logQTE,
    logTurnStart, logTurnEnd, logBattleStart, logBattleEnd, logNote,
    // Phase/turn
    setTurn, setPhase, getTurn, getPhase,
    // Queries
    getAll, getLast, getLastEntry, getByTurn, getByActor, getByTarget,
    getByType, getByTag, getSince,
    // Subs
    subscribe,
    // Lifecycle
    reset, summary
  });
})();
