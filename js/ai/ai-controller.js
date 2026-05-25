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
      const skillId = _resolveUnitSkillId(unit, action.substring('use_skill:'.length));
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
    skillId = _resolveUnitSkillId(unit, skillId);
    if (!skillId) return null;

    // Ownership check: does this unit actually have this skill?
    const SR = window.CJS.SkillResolver;
    if (SR && !SR.hasSkill(unit, skillId)) return null;

    // Use SkillResolver for per-unit overrides (range, mp cost, etc.)
    const skill = SR ? SR.resolveUnitSkill(unit, skillId) : DS().get('skills', skillId);
    if (!skill) return null;

    // Cooldown check
    const cd = unit.turnState?.cooldowns?.[skillId];
    if (cd && cd > 0) return null;

    // MP check
    if ((unit.currentMP || 0) < (skill.mp || 0)) return null;

    // AP check
    if ((unit.turnState?.apRemaining || 0) < (skill.ap || 1)) return null;

    // Weapon requirement — ActionHandler.validate rejects the action if the
    // unit doesn't meet it, which previously ended the AI's turn with no
    // action taken. Skip the skill entirely so the AI can fall through to a
    // viable option.
    const AH = window.CJS.ActionHandler;
    if (AH && AH.meetsWeaponRequirement && !AH.meetsWeaponRequirement(unit, skill)) return null;

    // Ultimate meter gate — same rationale.
    if (skill.isUltimate) {
      const cost = Number(skill.ultimateCost || 100);
      if ((unit.ultimateMeter || 0) < cost) return null;
    }

    // Find target(s)
    const range = Math.max(1, Number(skill.range || 1) + Number(unit.rangeBonus || 0));

    if (skill.aoe && skill.aoe !== 'none') {
      if (targetSpec === 'self' && unit.pos) {
        return {
          type: 'skill', skillId, aoeCenter: [...unit.pos],
          apCost: skill.ap || 1, mpCost: skill.mp || 0
        };
      }
      // AoE skill — pick best cell
      const cell = AIT().bestAoECell(unit, `aoe_${skill.aoe}`, skill.aoeSize || 2, range, {
        requireLoS: !!skill.requiresLoS
      });
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
    // Use weapon range if available (ranged weapons can basic attack at distance)
    const AH = window.CJS.ActionHandler;
    const range = (AH && AH.getAttackRange) ? AH.getAttackRange(unit) : 1;
    const pick = AIT().pickTarget(targetSpec, unit, ctx.allUnits, { range });
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

    // Find an attacker anchor cell that puts the attacker's footprint
    // ADJACENT to the target's footprint (Chebyshev distance 1 between
    // any cell of the attacker and any cell of the target). We need to
    // account for the ATTACKER's size too — for a 2x2 attacker, valid
    // melee anchors extend (size-1) cells beyond the 1-ring of a 1x1
    // target.
    const tgt = pick.unit;
    const candidates = [];
    const tgtSz = window.CJS.CONST.UNIT_SIZES[tgt.size || '1x1'] || { w: 1, h: 1 };
    const atkSz = window.CJS.CONST.UNIT_SIZES[unit.size || '1x1'] || { w: 1, h: 1 };
    for (let r = tgt.pos[0] - atkSz.h; r <= tgt.pos[0] + tgtSz.h; r++) {
      for (let c = tgt.pos[1] - atkSz.w; c <= tgt.pos[1] + tgtSz.w; c++) {
        // Footprint must fit on the board
        if (r < 0 || c < 0 ||
            r + atkSz.h > dims.height || c + atkSz.w > dims.width) continue;
        // Footprint must not overlap the target's footprint
        const overlaps =
          r < tgt.pos[0] + tgtSz.h && r + atkSz.h > tgt.pos[0] &&
          c < tgt.pos[1] + tgtSz.w && c + atkSz.w > tgt.pos[1];
        if (overlaps) continue;
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
    if (bestStep) return { type: 'move', targetPos: bestStep.to };

    // Final fallback: every melee anchor was unreachable (typically a large
    // unit hemmed in by walls/units around the target). Pick whichever
    // reachable cell minimises footprint distance to the target so the
    // attacker at least closes the gap instead of standing still.
    const reach = GE().getValidMoves(unit.instanceId);
    if (!reach.length) return null;
    const tgtAnchor = tgt.pos;
    let fallback = null;
    let fallbackDist = Infinity;
    for (const [r, c] of reach) {
      const d = Math.max(
        Math.abs(r - tgtAnchor[0]),
        Math.abs(c - tgtAnchor[1])
      );
      if (d < fallbackDist) { fallbackDist = d; fallback = [r, c]; }
    }
    return fallback ? { type: 'move', targetPos: fallback } : null;
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
    const archetype = _normalizeArchetype(unit.behaviorAI || 'aggressive');

    // Try to attack an enemy in weapon range
    const AH = window.CJS.ActionHandler;
    const atkRange = (AH && AH.getAttackRange) ? AH.getAttackRange(unit) : 1;
    const attackTarget = _attackTargetForArchetype(archetype);
    const adjacent = AIT().pickTarget(attackTarget, unit, ctx.allUnits, { range: atkRange })
      || (attackTarget !== 'nearest_enemy' ? AIT().pickTarget('nearest_enemy', unit, ctx.allUnits, { range: atkRange }) : null);
    if (adjacent && (unit.turnState?.apRemaining || 0) >= 1) {
      return { type: 'attack', targetId: adjacent.unit.instanceId, apCost: 1, mpCost: 0 };
    }

    // Try a ready skill (pick highest-power one)
    const SR = window.CJS.SkillResolver;
    const readySkills = (unit.skills || [])
      .map(entry => {
        const sid = SR ? SR.getSkillId(entry) : (typeof entry === 'string' ? entry : entry.skillId);
        return SR ? SR.resolveUnitSkill(unit, sid) : DS().get('skills', sid);
      })
      .filter(s => s && _canUseSkill(unit, s));
    const skillTargetPrefs = _skillTargetPrefs(archetype, unit);
    for (const skill of _rankSkillsForArchetype(readySkills, archetype)) {
      const decision = _firstSkillDecision(unit, skill, _targetPrefsForSkill(skill, skillTargetPrefs), ctx);
      if (decision) return decision;
    }

    // Move toward nearest enemy
    if (!unit.turnState?.hasMoved) {
      if (archetype === 'coward' || archetype === 'sniper') {
        const mv = _tryMoveAway(unit, 'nearest_enemy', ctx);
        if (mv) return mv;
      }
      if (archetype === 'swarmer') {
        const allyMove = _tryMoveToward(unit, 'pack_anchor_ally', ctx);
        if (allyMove) return allyMove;
      }
      const moveTarget = _moveTargetForArchetype(archetype);
      const mv = _tryMoveToward(unit, moveTarget, ctx)
        || (moveTarget !== 'nearest_enemy' ? _tryMoveToward(unit, 'nearest_enemy', ctx) : null);
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
    const AH = window.CJS.ActionHandler;
    if (AH && AH.meetsWeaponRequirement && !AH.meetsWeaponRequirement(unit, skill)) return false;
    if (skill.isUltimate) {
      const cost = Number(skill.ultimateCost || 100);
      if ((unit.ultimateMeter || 0) < cost) return false;
    }
    return true;
  }

  function _resolveUnitSkillId(unit, rawSkillId) {
    const raw = String(rawSkillId || '').trim();
    if (!raw) return '';
    const SR = window.CJS.SkillResolver;
    const ids = SR
      ? SR.getSkillIds(unit.skills || [])
      : (unit.skills || []).map((entry) => typeof entry === 'string' ? entry : entry?.skillId).filter(Boolean);
    if (ids.includes(raw)) return raw;
    return ids.find((id) => String(id).endsWith(`_${raw}`)) || raw;
  }

  function _normalizeArchetype(value) {
    const key = String(value || 'aggressive').toLowerCase().replace(/\s+/g, '_');
    return key === 'tactician' ? 'tactical' : key;
  }

  function _attackTargetForArchetype(archetype) {
    if (archetype === 'tactical') return 'healer_enemy';
    if (archetype === 'sniper') return 'squishiest';
    if (archetype === 'tank' || archetype === 'boss') return 'highest_threat_enemy';
    if (archetype === 'swarmer') return 'pack_target_enemy';
    return 'nearest_enemy';
  }

  function _moveTargetForArchetype(archetype) {
    if (archetype === 'tactical') return 'healer_enemy';
    if (archetype === 'tank' || archetype === 'boss') return 'highest_threat_enemy';
    if (archetype === 'swarmer') return 'pack_target_enemy';
    return 'nearest_enemy';
  }

  function _skillTargetPrefs(archetype, unit) {
    switch (archetype) {
      case 'support':
      case 'summoner':
        return ['self', 'lowest_hp_ally', 'support_enemy', 'nearest_enemy'];
      case 'sniper':
        return ['squishiest', 'lowest_hp_enemy', 'furthest_enemy', 'nearest_enemy'];
      case 'tactical':
        return ['healer_enemy', 'support_enemy', 'lowest_hp_enemy', 'most_clustered', 'nearest_enemy'];
      case 'coward':
        return ['nearest_enemy', 'squishiest', 'lowest_hp_enemy'];
      case 'tank':
        return ['highest_threat_enemy', 'nearest_enemy', 'lowest_hp_adjacent'];
      case 'boss':
        return _hpPct(unit) < 0.5
          ? ['most_clustered', 'highest_threat_enemy', 'lowest_hp_enemy', 'nearest_enemy']
          : ['highest_threat_enemy', 'most_clustered', 'nearest_enemy'];
      case 'swarmer':
        return ['pack_target_enemy', 'lowest_hp_enemy', 'nearest_enemy'];
      case 'berserker':
        return ['nearest_enemy', 'lowest_hp_enemy'];
      default:
        return ['nearest_enemy'];
    }
  }

  function _rankSkillsForArchetype(skills, archetype) {
    return [...skills].sort((a, b) => {
      if (archetype === 'support' || archetype === 'summoner') {
        return _supportSkillScore(b) - _supportSkillScore(a);
      }
      if (archetype === 'tank') {
        return _controlSkillScore(b) - _controlSkillScore(a);
      }
      return (b.power || 0) - (a.power || 0);
    });
  }

  function _targetPrefsForSkill(skill, fallbackPrefs) {
    const text = [skill.id, skill.name, skill.description, ...(skill.tags || [])].join(' ').toLowerCase();
    if (/(heal|regen|restore|mend|cure)/.test(text)) {
      return ['lowest_hp_ally', 'self', ...fallbackPrefs];
    }
    if (/(heal|regen|restore|shield|guard|buff|chant|roar|summon|raise)/.test(text) || !skill.power) {
      return ['self', 'lowest_hp_ally', ...fallbackPrefs];
    }
    if (skill.aoe && skill.aoe !== 'none') {
      return ['most_clustered', ...fallbackPrefs];
    }
    return fallbackPrefs;
  }

  function _firstSkillDecision(unit, skill, targetPrefs, ctx) {
    const seen = new Set();
    for (const pref of targetPrefs) {
      if (!pref || seen.has(pref)) continue;
      seen.add(pref);
      const decision = _tryUseSkill(unit, skill.id, pref, ctx);
      if (decision) return decision;
    }
    return null;
  }

  function _supportSkillScore(skill) {
    const text = [skill.id, skill.name, skill.description, ...(skill.tags || [])].join(' ').toLowerCase();
    return (/(heal|regen|restore|shield|buff|summon|raise|chant)/.test(text) ? 100 : 0) + (skill.power || 0);
  }

  function _controlSkillScore(skill) {
    const text = [skill.id, skill.name, skill.description, ...(skill.tags || [])].join(' ').toLowerCase();
    return (/(taunt|stun|slow|root|knock|mark|shield|guard)/.test(text) ? 100 : 0) + (skill.power || 0);
  }

  function _hpPct(unit) {
    return unit?.maxHP ? (unit.currentHP || 0) / unit.maxHP : 1;
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
