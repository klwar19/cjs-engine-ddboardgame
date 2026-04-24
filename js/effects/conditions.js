// conditions.js
// Evaluates condition strings for effects and AI rules.
// Parses: "hp_below_30 AND has_status_burn OR is_type_beast"
// Pure functions — no state.
// Reads: nothing (receives combat context as argument)
// Used by: effect-resolver.js, ai-conditions.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.Conditions = (() => {
  'use strict';

  // ── MAIN EVALUATOR ─────────────────────────────────────────────────
  // conditions: string or array of strings
  // context: {
  //   unit:           the unit being checked (usually effect owner)
  //   target:         the target of the action (if applicable)
  //   attacker:       the unit that attacked (for on_take_damage)
  //   damageType:     "Physical" | "Magic" | "Chaos" | "True"
  //   element:        "Fire" | "Water" | ...
  //   isCritical:     boolean
  //   skillUsed:      skill object
  //   gridEngine:     grid engine reference (for position checks)
  //   turnNumber:     current turn number
  //   combatState:    { unitsAlive, ... }
  // }

  function evaluate(conditions, context) {
    if (!conditions || conditions.length === 0) return true;

    // String: parse compound logic
    if (typeof conditions === 'string') {
      return _evaluateCompound(conditions, context);
    }

    // Array: all must be true (implicit AND)
    if (Array.isArray(conditions)) {
      return conditions.every(c => _evaluateCompound(c, context));
    }

    return true;
  }

  // ── COMPOUND LOGIC PARSER ──────────────────────────────────────────
  // Supports: "cond1 AND cond2 OR cond3"
  // Precedence: AND binds tighter than OR (standard)
  // "A AND B OR C AND D" = "(A AND B) OR (C AND D)"

  function _evaluateCompound(str, ctx) {
    const trimmed = str.trim();
    if (!trimmed) return true;

    // Split by OR first (lower precedence)
    const orGroups = trimmed.split(/\s+OR\s+/);
    return orGroups.some(group => {
      // Each OR group is a series of AND conditions
      const andParts = group.split(/\s+AND\s+/);
      return andParts.every(part => _evaluateSingle(part.trim(), ctx));
    });
  }

  // ── SINGLE CONDITION EVALUATOR ─────────────────────────────────────

  function _evaluateSingle(condition, ctx) {
    if (!condition || condition === 'default' || condition === 'always') return true;

    const unit = ctx.unit || {};
    const target = ctx.target || {};
    const attacker = ctx.attacker || {};

    // ── Negation: NOT_xxx ──
    if (condition.startsWith('NOT_')) {
      return !_evaluateSingle(condition.substring(4), ctx);
    }

    // ── HP CHECKS ──
    if (condition.startsWith('hp_below_')) {
      const pct = parseInt(condition.split('_')[2], 10);
      return _hpPercent(unit) < pct;
    }
    if (condition.startsWith('hp_above_')) {
      const pct = parseInt(condition.split('_')[2], 10);
      return _hpPercent(unit) > pct;
    }
    if (condition === 'is_full_hp') {
      return (unit.currentHP || 0) >= (unit.maxHP || 1);
    }
    if (condition === 'is_low_hp') {
      return _hpPercent(unit) < 30;
    }

    // ── MP CHECKS ──
    if (condition.startsWith('mp_below_')) {
      const pct = parseInt(condition.split('_')[2], 10);
      return _mpPercent(unit) < pct;
    }
    if (condition.startsWith('mp_above_')) {
      const pct = parseInt(condition.split('_')[2], 10);
      return _mpPercent(unit) > pct;
    }

    // ── TARGET HP CHECKS ──
    if (condition.startsWith('target_hp_below_')) {
      const pct = parseInt(condition.split('_')[3], 10);
      return _hpPercent(target) < pct;
    }
    if (condition.startsWith('target_hp_above_')) {
      const pct = parseInt(condition.split('_')[3], 10);
      return _hpPercent(target) > pct;
    }

    // ── STATUS CHECKS ──
    if (condition.startsWith('has_status_')) {
      const status = condition.substring(11);
      return _hasStatus(unit, status);
    }
    if (condition.startsWith('not_has_status_')) {
      const status = condition.substring(15);
      return !_hasStatus(unit, status);
    }
    if (condition.startsWith('target_has_status_')) {
      const status = condition.substring(18);
      return _hasStatus(target, status);
    }

    // ── TYPE CHECKS ──
    if (condition.startsWith('is_type_')) {
      const type = condition.substring(8);
      return unit.type === type;
    }
    if (condition.startsWith('target_is_type_')) {
      const type = condition.substring(15);
      return target.type === type;
    }
    if (condition.startsWith('attacker_is_type_')) {
      const type = condition.substring(17);
      return attacker.type === type;
    }

    // ── DAMAGE TYPE CHECKS ──
    if (condition.startsWith('damage_type_is_')) {
      const dtype = condition.substring(15);
      return ctx.damageType === dtype;
    }
    if (condition.startsWith('element_is_')) {
      const elem = condition.substring(11);
      return ctx.element === elem;
    }

    // ── COMBAT EVENT CHECKS ──
    if (condition === 'is_critical_hit')  return !!ctx.isCritical;
    if (condition === 'is_not_critical')  return !ctx.isCritical;
    if (condition === 'is_melee_attack')  return (ctx.skillUsed?.range || 1) <= 1;
    if (condition === 'is_ranged_attack') return (ctx.skillUsed?.range || 1) > 1;
    if (condition === 'is_magic_skill')   return ctx.skillUsed?.damageType === 'Magic';
    if (condition === 'is_physical_skill')return ctx.skillUsed?.damageType === 'Physical';

    // ── POSITION CHECKS (require gridEngine in context) ──
    if (condition === 'attacker_adjacent') {
      return _isAdjacent(unit, attacker, ctx.gridEngine);
    }
    if (condition === 'adjacent_to_ally') {
      return _hasAdjacentAlly(unit, ctx);
    }
    if (condition === 'adjacent_to_enemy') {
      return _hasAdjacentEnemy(unit, ctx);
    }
    if (condition === 'no_adjacent_enemies') {
      return !_hasAdjacentEnemy(unit, ctx);
    }
    if (condition === 'on_high_ground') {
      return _onTerrain(unit, 'high_ground', ctx.gridEngine);
    }
    if (condition.startsWith('on_terrain_')) {
      const terrain = condition.substring(11);
      return _onTerrain(unit, terrain, ctx.gridEngine);
    }
    if (condition.startsWith('distance_to_target_gt_')) {
      const dist = parseInt(condition.split('_').pop(), 10);
      return _distance(unit, target) > dist;
    }
    if (condition.startsWith('distance_to_target_lt_')) {
      const dist = parseInt(condition.split('_').pop(), 10);
      return _distance(unit, target) < dist;
    }

    // ── TURN / TIME CHECKS ──
    if (condition === 'turn_1') return (ctx.turnNumber || 1) === 1;
    if (condition.startsWith('turn_')) {
      const t = parseInt(condition.split('_')[1], 10);
      return (ctx.turnNumber || 1) === t;
    }
    if (condition.startsWith('every_') && condition.endsWith('_turns')) {
      const n = parseInt(condition.split('_')[1], 10);
      return (ctx.turnNumber || 1) % n === 0;
    }

    // ── CONSECUTIVE HIT CHECKS ──
    if (condition.startsWith('consecutive_hit_')) {
      const n = parseInt(condition.split('_')[2], 10);
      return (ctx.consecutiveHits || 0) >= n;
    }

    // ── TEAM / UNIT COUNT CHECKS ──
    if (condition === 'is_last_ally') {
      return (ctx.combatState?.alliesAlive || 1) === 1;
    }
    if (condition === 'is_last_enemy') {
      return (ctx.combatState?.enemiesAlive || 1) === 1;
    }
    if (condition.startsWith('allies_alive_gt_')) {
      const n = parseInt(condition.split('_').pop(), 10);
      return (ctx.combatState?.alliesAlive || 0) > n;
    }
    if (condition.startsWith('enemies_alive_gt_')) {
      const n = parseInt(condition.split('_').pop(), 10);
      return (ctx.combatState?.enemiesAlive || 0) > n;
    }

    // ── SKILL COOLDOWN CHECKS (for AI) ──
    if (condition.startsWith('skill_ready:') || condition.startsWith('skill_off_cooldown:')) {
      const skillId = condition.split(':')[1];
      const cooldowns = unit.cooldowns || {};
      return (cooldowns[skillId] || 0) <= 0;
    }

    // ── AI-SPECIFIC CHECKS ──
    if (condition === 'any_adjacent_enemy') {
      return _hasAdjacentEnemy(unit, ctx);
    }
    if (condition.startsWith('enemies_in_range:')) {
      const parts = condition.split(':')[1].split('>=');
      const range = parseInt(parts[0], 10);
      const count = parseInt(parts[1], 10);
      return _enemiesInRange(unit, range, ctx) >= count;
    }

    // ── CHANCE CHECK ──
    if (condition.startsWith('chance_')) {
      const pct = parseInt(condition.split('_')[1], 10);
      return Math.random() * 100 < pct;
    }

    // ── UNKNOWN ──
    console.warn(`Conditions: unknown condition "${condition}"`);
    return true; // unknown conditions pass (fail-open for content flexibility)
  }

  // ── HELPER FUNCTIONS ───────────────────────────────────────────────

  function _hpPercent(unit) {
    if (!unit.maxHP || unit.maxHP <= 0) return 100;
    return (unit.currentHP / unit.maxHP) * 100;
  }

  function _mpPercent(unit) {
    if (!unit.maxMP || unit.maxMP <= 0) return 100;
    return (unit.currentMP / unit.maxMP) * 100;
  }

  function _hasStatus(unit, statusId) {
    if (!unit.activeStatuses) return false;
    return unit.activeStatuses.some(s => s.statusId === statusId || s.id === statusId);
  }

  // Normalize position: supports both [r, c] array and {x, y} object
  function _getPos(unit) {
    if (!unit || !unit.pos) return null;
    if (Array.isArray(unit.pos)) {
      return { x: unit.pos[0], y: unit.pos[1] };
    }
    if (typeof unit.pos === 'object') {
      // Support both {x,y} and {row,col}
      return {
        x: unit.pos.x !== undefined ? unit.pos.x : (unit.pos.row !== undefined ? unit.pos.row : 0),
        y: unit.pos.y !== undefined ? unit.pos.y : (unit.pos.col !== undefined ? unit.pos.col : 0)
      };
    }
    return null;
  }

  function _isAdjacent(unitA, unitB, gridEngine) {
    const posA = _getPos(unitA);
    const posB = _getPos(unitB);
    if (!posA || !posB) return false;
    const dx = Math.abs(posA.x - posB.x);
    const dy = Math.abs(posA.y - posB.y);
    return dx <= 1 && dy <= 1 && (dx + dy > 0);
  }

  function _hasAdjacentAlly(unit, ctx) {
    if (!ctx.combatState?.units) return false;
    return ctx.combatState.units.some(u =>
      u.id !== unit.id && u.team === unit.team && u.currentHP > 0 &&
      _isAdjacent(unit, u)
    );
  }

  function _hasAdjacentEnemy(unit, ctx) {
    if (!ctx.combatState?.units) return false;
    return ctx.combatState.units.some(u =>
      u.team !== unit.team && u.currentHP > 0 &&
      _isAdjacent(unit, u)
    );
  }

  function _onTerrain(unit, terrainType, gridEngine) {
    if (!gridEngine) return false;
    const pos = _getPos(unit);
    if (!pos) return false;
    const cell = gridEngine.getCell?.(pos.x, pos.y);
    return cell?.terrain === terrainType;
  }

  function _distance(unitA, unitB) {
    const posA = _getPos(unitA);
    const posB = _getPos(unitB);
    if (!posA || !posB) return 999;
    return Math.abs(posA.x - posB.x) + Math.abs(posA.y - posB.y);
  }

  function _enemiesInRange(unit, range, ctx) {
    if (!ctx.combatState?.units) return 0;
    const pos = _getPos(unit);
    if (!pos) return 0;
    return ctx.combatState.units.filter(u =>
      u.team !== unit.team && u.currentHP > 0 && _distance(unit, u) <= range
    ).length;
  }

  // ── DESCRIBE (for editor preview) ──────────────────────────────────
  function describe(condition) {
    if (!condition || condition === 'always' || condition === 'default') return 'Always';

    const descriptions = {
      is_full_hp:       'At full HP',
      is_low_hp:        'HP below 30%',
      is_critical_hit:  'On critical hit',
      is_melee_attack:  'Melee attack',
      is_ranged_attack: 'Ranged attack',
      is_magic_skill:   'Magic skill used',
      is_physical_skill:'Physical skill used',
      attacker_adjacent:'Attacker is adjacent',
      adjacent_to_ally: 'Adjacent to an ally',
      adjacent_to_enemy:'Adjacent to an enemy',
      no_adjacent_enemies: 'No enemies adjacent',
      on_high_ground:   'On high ground',
      is_last_ally:     'Last ally standing',
      is_last_enemy:    'Last enemy remaining',
      turn_1:           'First turn only',
      any_adjacent_enemy:'Any enemy adjacent'
    };

    if (descriptions[condition]) return descriptions[condition];

    // Pattern matches
    if (condition.startsWith('hp_below_')) return `HP below ${condition.split('_')[2]}%`;
    if (condition.startsWith('hp_above_')) return `HP above ${condition.split('_')[2]}%`;
    if (condition.startsWith('has_status_')) return `Has status: ${condition.substring(11)}`;
    if (condition.startsWith('is_type_')) return `Unit type: ${condition.substring(8)}`;
    if (condition.startsWith('chance_')) return `${condition.split('_')[1]}% chance`;
    if (condition.startsWith('consecutive_hit_')) return `${condition.split('_')[2]}+ consecutive hits`;
    if (condition.startsWith('NOT_')) return `NOT ${describe(condition.substring(4))}`;

    return condition; // fallback: raw string
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    evaluate,
    describe
  });
})();
