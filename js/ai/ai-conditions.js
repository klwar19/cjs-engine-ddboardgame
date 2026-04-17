// ai-conditions.js
// Condition evaluator for AI rules. Reuses the shared conditions.js where
// it can; adds AI-specific conditions like skill_ready, ap_available,
// enemies_in_range:N >= M, any_adjacent_enemy, at_low_hp_self, etc.
//
// Each monster.aiRules[] entry has:
//   { priority, condition, action, target }
// AI-controller evaluates rules in priority order; first rule whose
// condition passes is chosen.
//
// Reads: conditions.js (for shared predicates), grid-engine, status-manager,
//        constants
// Used by: ai-controller.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AIConditions = (() => {
  'use strict';

  const Cond = () => window.CJS.Conditions;
  const GE   = () => window.CJS.GridEngine;
  const SM   = () => window.CJS.StatusManager;

  // ── MAIN EVALUATOR ─────────────────────────────────────────────────
  // conditionStr: string. Supports AND/OR compound via the shared evaluator,
  // with AI-specific single-predicates handled here.
  // context: {
  //   unit:          the AI unit itself
  //   allEnemies, allAllies, allUnits,
  //   turnNumber
  // }
  function evaluate(conditionStr, context) {
    if (!conditionStr || conditionStr === 'default' || conditionStr === 'always') return true;

    // Split by OR (lower precedence), then by AND
    const orGroups = String(conditionStr).split(/\s+OR\s+/);
    return orGroups.some(group => {
      const andParts = group.split(/\s+AND\s+/);
      return andParts.every(part => _evaluateSingle(part.trim(), context));
    });
  }

  // ── SINGLE PREDICATE ───────────────────────────────────────────────
  function _evaluateSingle(pred, ctx) {
    if (!pred) return true;

    // Negation
    if (pred.startsWith('NOT_')) return !_evaluateSingle(pred.substring(4), ctx);

    const unit = ctx.unit;
    if (!unit) return false;

    // ── HP/MP on self ───────────────────────────────────────────
    if (pred === 'at_low_hp_self' || pred === 'hp_below_30') {
      return (unit.currentHP / unit.maxHP) < 0.30;
    }
    if (pred === 'hp_below_50') return (unit.currentHP / unit.maxHP) < 0.50;
    if (pred === 'hp_above_50') return (unit.currentHP / unit.maxHP) > 0.50;
    if (pred === 'hp_full')     return unit.currentHP >= unit.maxHP;
    if (pred.startsWith('hp_below_')) {
      const n = parseInt(pred.split('_')[2], 10);
      if (!isNaN(n)) return (unit.currentHP / unit.maxHP) * 100 < n;
    }
    if (pred.startsWith('hp_above_')) {
      const n = parseInt(pred.split('_')[2], 10);
      if (!isNaN(n)) return (unit.currentHP / unit.maxHP) * 100 > n;
    }
    if (pred.startsWith('mp_below_')) {
      const n = parseInt(pred.split('_')[2], 10);
      if (!isNaN(n)) return (unit.currentMP / unit.maxMP) * 100 < n;
    }

    // ── AP/MP availability ──────────────────────────────────────
    if (pred.startsWith('ap_at_least_')) {
      const n = parseInt(pred.split('_')[3], 10);
      return (unit.turnState?.apRemaining || 0) >= n;
    }
    if (pred.startsWith('mp_at_least_')) {
      const n = parseInt(pred.split('_')[3], 10);
      return (unit.currentMP || 0) >= n;
    }

    // ── SKILL READINESS ──────────────────────────────────────────
    if (pred.startsWith('skill_ready:')) {
      const skillId = pred.substring('skill_ready:'.length);
      return _isSkillReady(unit, skillId);
    }
    if (pred.startsWith('skill_on_cooldown:')) {
      const skillId = pred.substring('skill_on_cooldown:'.length);
      return !_isSkillReady(unit, skillId);
    }

    // ── ENEMY PRESENCE / POSITIONING ─────────────────────────────
    if (pred === 'any_adjacent_enemy') {
      return _enemiesInRange(unit, ctx, 1).length > 0;
    }
    if (pred === 'no_adjacent_enemy') {
      return _enemiesInRange(unit, ctx, 1).length === 0;
    }
    if (pred.startsWith('enemies_in_range:')) {
      // "enemies_in_range:3 >= 2"  — count of enemies in Chebyshev range ≥ N
      const m = pred.match(/^enemies_in_range:(\d+)\s*(>=|<=|=|>|<)\s*(\d+)$/);
      if (!m) return false;
      const range = parseInt(m[1], 10);
      const op    = m[2];
      const n     = parseInt(m[3], 10);
      const count = _enemiesInRange(unit, ctx, range).length;
      return _compare(count, op, n);
    }
    if (pred === 'outnumbered') {
      const allies  = _alliesAlive(unit, ctx).length;
      const enemies = _enemiesAlive(unit, ctx).length;
      return enemies > allies;
    }
    if (pred === 'winning_numbers') {
      const allies  = _alliesAlive(unit, ctx).length;
      const enemies = _enemiesAlive(unit, ctx).length;
      return allies > enemies;
    }

    // ── ALLY STATUS ──────────────────────────────────────────────
    if (pred === 'ally_wounded') {
      const allies = _alliesAlive(unit, ctx);
      return allies.some(a => a !== unit && (a.currentHP / a.maxHP) < 0.50);
    }
    if (pred === 'any_ally_dying') {
      const allies = _alliesAlive(unit, ctx);
      return allies.some(a => a !== unit && (a.currentHP / a.maxHP) < 0.25);
    }

    // ── STATUS CHECKS ─────────────────────────────────────────────
    if (pred.startsWith('has_status_')) {
      const statusId = pred.substring('has_status_'.length);
      return SM() ? SM().hasStatus(unit, statusId) : false;
    }
    if (pred.startsWith('target_has_status_')) {
      const statusId = pred.substring('target_has_status_'.length);
      return SM() && ctx.target ? SM().hasStatus(ctx.target, statusId) : false;
    }

    // ── TURN / BATTLE STATE ──────────────────────────────────────
    if (pred.startsWith('turn_above_')) {
      const n = parseInt(pred.split('_')[2], 10);
      return (ctx.turnNumber || 0) > n;
    }
    if (pred === 'first_turn')  return (ctx.turnNumber || 0) === 1;

    // ── FALLBACK: delegate to shared Conditions module ───────────
    if (Cond()) {
      return Cond().evaluate(pred, { ...ctx, unit });
    }

    console.warn('AIConditions: unknown predicate', pred);
    return false;
  }

  // ── HELPERS ────────────────────────────────────────────────────────
  function _isSkillReady(unit, skillId) {
    const cd = unit.turnState?.cooldowns?.[skillId];
    if (cd && cd > 0) return false;
    // TODO: MP check could be here too, but skill_ready is usually cooldown-only.
    return true;
  }

  function _enemiesAlive(unit, ctx) {
    const units = ctx.allUnits || (GE() ? GE().getAllUnits() : []);
    return units.filter(u => u.team !== unit.team && (u.currentHP || 0) > 0);
  }

  function _alliesAlive(unit, ctx) {
    const units = ctx.allUnits || (GE() ? GE().getAllUnits() : []);
    return units.filter(u => u.team === unit.team && (u.currentHP || 0) > 0);
  }

  function _enemiesInRange(unit, ctx, range) {
    if (!GE()) return [];
    const enemies = _enemiesAlive(unit, ctx);
    return enemies.filter(e => GE().footprintDistance(unit, e) <= range);
  }

  function _compare(a, op, b) {
    switch (op) {
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '>':  return a > b;
      case '<':  return a < b;
      case '=':  return a === b;
      default:   return false;
    }
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({ evaluate });
})();
