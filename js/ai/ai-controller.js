// ai-controller.js
// Evaluates a unit's aiRules[] in priority order and returns a decision:
//   { type: 'skill'|'attack'|'move'|'defend'|'end_turn',
//     skillId?, targetId?, targetPos?, aoeCenter? }
//
// A rule looks like:
//   { priority: 1, condition: "hp_below_30 AND skill_ready:frost_breath",
//     action: "use_skill:frost_breath", target: "most_clustered" }
//
// Rules are sorted by priority (lower = earlier). First rule whose condition
// passes wins. If no rule matches, fall back to archetype default.
//
// Reads: ai-conditions, ai-targeting, grid-engine, data-store, constants
// Used by: combat-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AIController = (() => {
  'use strict';

  const AIC = () => window.CJS.AIConditions;
  const AIT = () => window.CJS.AITargeting;
  const GE  = () => window.CJS.GridEngine;
  const DS  = () => window.CJS.DataStore;
  const PF  = () => window.CJS.Pathfinding;

  // ── MAIN: DECIDE ACTION ────────────────────────────────────────────
  // unit: the compiled AI unit
  // returns: action object (see header)
  function decide(unit) {
    if (!unit) return { type: 'end_turn' };

    const ctx = _buildContext(unit);

    // 1. Rule-based evaluation
    const rules = _sortedRules(unit);
    for (const rule of rules) {
      if (!AIC().evaluate(rule.condition, ctx)) continue;
      const decision = _decodeRule(rule, unit, ctx);
      if (decision) return decision;
    }

    // 2. Archetype fallback
    return _archetypeDefault(unit, ctx);
  }

  // ── RULE DECODING ──────────────────────────────────────────────────
  function _decodeRule(rule, unit, ctx) {
    const action = (rule.action || '').trim();
    const targetSpec = rule.target || 'nearest_enemy';

    // "use_skill:skillId"
    if (action.startsWith('use_skill:')) {
      const skillId = action.substring('use_skill:'.length);
      return _tryUseSkill(unit, skillId, targetSpec, ctx);
    }

    // "attack" (basic attack, no skill)
    if (action === 'attack' || action === 'basic_attack') {
      return _tryBasicAttack(unit, targetSpec, ctx);
    }

    // "move_toward"
    if (action === 'move_toward') {
      return _tryMoveToward(unit, targetSpec, ctx);
    }

    // "move_away" (coward / kiting)
    if (action === 'move_away') {
      return _tryMoveAway(unit, targetSpec, ctx);
    }

    // "defend"
    if (action === 'defend') {
      return { type: 'defend' };
    }

    // "end_turn"
    if (action === 'end_turn' || action === 'wait') {
      return { type: 'end_turn' };
    }

    // "flee" — move to furthest cell from all enemies
    if (action === 'flee') {
      return _tryFlee(unit, ctx);
    }

    return null;
  }

  // ── TRY USE SKILL ──────────────────────────────────────────────────
  function _tryUseSkill(unit, skillId, targetSpec, ctx) {
    const skill = DS().get('skills', skillId);
    if (!skill) return null;

    // Cooldown check
    const cd = unit.turnState?.cooldowns?.[skillId];
    if (cd && cd > 0) return null;

    // MP check
    if ((unit.currentMP || 0) < (skill.mp || 0)) return null;

    // AP check
    if ((unit.turnState?.apRemaining || 0) < (skill.ap || 1)) return null;

    // Find target(s)
    const range = (skill.range || 1) + (unit.rangeBonus || 0);

    if (skill.aoe && skill.aoe !== 'none') {
      // AoE skill — pick best cell
      const cell = AIT().bestAoECell(unit, `aoe_${skill.aoe}`, skill.aoeSize || 2, range);
      if (!cell) return null;
      return {
        type: 'skill', skillId, aoeCenter: cell.cell,
        apCost: skill.ap || 1, mpCost: skill.mp || 0
      };
    }

    // Single-target skill
    const pick = AIT().pickTarget(targetSpec, unit, ctx.allUnits, {
      range, requireLoS: !!skill.requiresLoS
    });
    if (!pick) return null;

    return {
      type: 'skill', skillId, targetId: pick.unit.instanceId,
      apCost: skill.ap || 1, mpCost: skill.mp || 0
    };
  }

  // ── TRY BASIC ATTACK ───────────────────────────────────────────────
  function _tryBasicAttack(unit, targetSpec, ctx) {
    if ((unit.turnState?.apRemaining || 0) < 1) return null;
    const pick = AIT().pickTarget(targetSpec, unit, ctx.allUnits, { range: 1 });
    if (!pick) return null;
    return {
      type: 'attack', targetId: pick.unit.instanceId,
      apCost: 1, mpCost: 0
    };
  }

  // ── TRY MOVE TOWARD ────────────────────────────────────────────────
  function _tryMoveToward(unit, targetSpec, ctx) {
    if (unit.turnState?.hasMoved) return null;
    const pick = AIT().pickTarget(targetSpec, unit, ctx.allUnits);
    if (!pick) return null;

    if (!GE() || !PF()) return null;
    const dims = GE().getDims();

    // Find a destination cell ADJACENT to the target (the target's cell
    // itself is occupied). Pick the adjacent cell closest to us that's passable
    // and within our movement range.
    const tgt = pick.unit;
    const candidates = [];
    const sz = window.CJS.CONST.UNIT_SIZES[tgt.size || '1x1'] || { w: 1, h: 1 };
    // All cells adjacent to the target's footprint
    for (let r = tgt.pos[0] - 1; r <= tgt.pos[0] + sz.h; r++) {
      for (let c = tgt.pos[1] - 1; c <= tgt.pos[1] + sz.w; c++) {
        // Skip cells inside the target's footprint
        if (r >= tgt.pos[0] && r < tgt.pos[0] + sz.h &&
            c >= tgt.pos[1] && c < tgt.pos[1] + sz.w) continue;
        // Skip out of bounds
        if (r < 0 || c < 0 || r >= dims.height || c >= dims.width) continue;
        candidates.push([r, c]);
      }
    }

    // Sort by distance from attacker (closest first)
    candidates.sort((a, b) => {
      const da = Math.max(Math.abs(a[0] - unit.pos[0]), Math.abs(a[1] - unit.pos[1]));
      const db = Math.max(Math.abs(b[0] - unit.pos[0]), Math.abs(b[1] - unit.pos[1]));
      return da - db;
    });

    const gridSnap = _gridSnapshot(dims);
    const occSnap  = _occupancySnapshot(dims);

    // First, see if any adjacent cell is reachable this turn
    for (const [r, c] of candidates) {
      const path = PF().findPath({
        from: unit.pos, to: [r, c],
        maxMP: unit.movement || 3, unitId: unit.instanceId, size: unit.size,
        grid: gridSnap, occupancy: occSnap,
        width: dims.width, height: dims.height
      });
      if (path) {
        // Arrived at [r, c] — attack will happen on next sub-action
        return { type: 'move', targetPos: [r, c] };
      }
    }

    // Not reachable this turn — walk as far along the best path as possible.
    // Try stepToward each candidate, pick the one that gets us closest.
    let bestStep = null;
    let bestDistAfter = Infinity;
    for (const [r, c] of candidates) {
      const step = PF().stepToward({
        from: unit.pos, to: [r, c],
        maxMP: unit.movement || 3, unitId: unit.instanceId, size: unit.size,
        grid: gridSnap, occupancy: occSnap,
        width: dims.width, height: dims.height
      });
      if (!step) continue;
      // How close would we end up?
      const distAfter = Math.max(
        Math.abs(step.to[0] - tgt.pos[0]),
        Math.abs(step.to[1] - tgt.pos[1])
      );
      if (distAfter < bestDistAfter) {
        bestDistAfter = distAfter;
        bestStep = step;
      }
    }
    return bestStep ? { type: 'move', targetPos: bestStep.to } : null;
  }

  // ── TRY MOVE AWAY ──────────────────────────────────────────────────
  function _tryMoveAway(unit, targetSpec, ctx) {
    if (unit.turnState?.hasMoved) return null;
    const pick = AIT().pickTarget(targetSpec, unit, ctx.allUnits);
    if (!pick) return null;

    // Find the cell within movement range that maximises distance from target.
    const reach = GE().getValidMoves(unit.instanceId);
    if (!reach.length) return null;

    let best = null;
    let bestDist = -Infinity;
    for (const [r, c] of reach) {
      const d = Math.max(
        Math.abs(r - pick.unit.pos[0]),
        Math.abs(c - pick.unit.pos[1])
      );
      if (d > bestDist) { bestDist = d; best = [r, c]; }
    }
    return best ? { type: 'move', targetPos: best } : null;
  }

  // ── TRY FLEE ───────────────────────────────────────────────────────
  function _tryFlee(unit, ctx) {
    if (unit.turnState?.hasMoved) return null;
    const enemies = ctx.allUnits.filter(u =>
      u.team !== unit.team && (u.currentHP || 0) > 0
    );
    if (!enemies.length) return null;

    const reach = GE().getValidMoves(unit.instanceId);
    if (!reach.length) return null;

    // Score each reachable cell by sum of distances from all enemies (higher is better)
    let best = null;
    let bestScore = -Infinity;
    for (const [r, c] of reach) {
      let score = 0;
      for (const e of enemies) {
        score += Math.max(Math.abs(r - e.pos[0]), Math.abs(c - e.pos[1]));
      }
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    }
    return best ? { type: 'move', targetPos: best } : null;
  }

  // ── ARCHETYPE DEFAULTS ─────────────────────────────────────────────
  // When no rule matches (or unit has no rules), fall back to an archetype-
  // based default behavior.
  function _archetypeDefault(unit, ctx) {
    const archetype = unit.behaviorAI || 'aggressive';

    // Try to attack an adjacent enemy
    const adjacent = AIT().pickTarget('nearest_enemy', unit, ctx.allUnits, { range: 1 });
    if (adjacent && (unit.turnState?.apRemaining || 0) >= 1) {
      return { type: 'attack', targetId: adjacent.unit.instanceId, apCost: 1, mpCost: 0 };
    }

    // Try a ready skill (pick highest-power one)
    const readySkills = (unit.skills || [])
      .map(id => DS().get('skills', id))
      .filter(s => s && _canUseSkill(unit, s));
    if (readySkills.length) {
      readySkills.sort((a, b) => (b.power || 0) - (a.power || 0));
      const skill = readySkills[0];
      const strategy = archetype === 'support' ? 'lowest_hp_ally'
                     : archetype === 'sniper'  ? 'squishiest'
                     : 'nearest_enemy';
      const decision = _tryUseSkill(unit, skill.id, strategy, ctx);
      if (decision) return decision;
    }

    // Move toward nearest enemy
    if (!unit.turnState?.hasMoved) {
      if (archetype === 'coward' || archetype === 'sniper') {
        const mv = _tryMoveAway(unit, 'nearest_enemy', ctx);
        if (mv) return mv;
      }
      const mv = _tryMoveToward(unit, 'nearest_enemy', ctx);
      if (mv) return mv;
    }

    // Defend if low HP and nothing else works
    if ((unit.currentHP / unit.maxHP) < 0.4 && !unit.turnState?.mainActionUsed) {
      return { type: 'defend' };
    }

    return { type: 'end_turn' };
  }

  function _canUseSkill(unit, skill) {
    const cd = unit.turnState?.cooldowns?.[skill.id];
    if (cd && cd > 0) return false;
    if ((unit.currentMP || 0) < (skill.mp || 0)) return false;
    if ((unit.turnState?.apRemaining || 0) < (skill.ap || 1)) return false;
    return true;
  }

  // ── CONTEXT BUILDING ───────────────────────────────────────────────
  function _buildContext(unit) {
    const allUnits = GE() ? GE().getAllUnits() : [];
    return {
      unit,
      allUnits,
      allEnemies: allUnits.filter(u => u.team !== unit.team && (u.currentHP || 0) > 0),
      allAllies:  allUnits.filter(u => u.team === unit.team && (u.currentHP || 0) > 0),
      turnNumber: window.CJS.CombatLog ? window.CJS.CombatLog.getTurn() : 1
    };
  }

  function _sortedRules(unit) {
    return [...(unit.aiRules || [])].sort((a, b) => (a.priority || 99) - (b.priority || 99));
  }

  // ── GRID ACCESS HELPERS ───────────────────────────────────────────
  // Pathfinding needs raw grid + occupancy arrays, but grid-engine only
  // exposes higher-level queries. We build minimal snapshots on demand.
  function _gridSnapshot(dims) {
    const g = [];
    for (let r = 0; r < dims.height; r++) {
      g[r] = [];
      for (let c = 0; c < dims.width; c++) {
        const cell = GE().getCell(r, c);
        g[r][c] = cell ? cell.terrain : 'empty';
      }
    }
    return g;
  }
  function _occupancySnapshot(dims) {
    const o = [];
    for (let r = 0; r < dims.height; r++) {
      o[r] = [];
      for (let c = 0; c < dims.width; c++) {
        const cell = GE().getCell(r, c);
        o[r][c] = cell ? cell.unitId : null;
      }
    }
    return o;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    decide,
    // Exposed for testing / UI preview
    _buildContext, _decodeRule, _archetypeDefault
  });
})();
