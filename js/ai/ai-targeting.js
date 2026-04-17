// ai-targeting.js
// Pure functions for picking a target based on a named strategy:
//   'nearest_enemy', 'lowest_hp_enemy', 'highest_hp_enemy',
//   'lowest_hp_adjacent', 'most_clustered', 'random_enemy',
//   'lowest_hp_ally', 'squishiest', 'most_threatening',
//   'furthest_enemy', 'lowest_dr_enemy', 'highest_damage_enemy'
//
// Each strategy takes (attacker, candidates, grid) and returns a single
// chosen unit (or null if no valid target).
//
// Reads: grid-engine, constants
// Used by: ai-controller.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AITargeting = (() => {
  'use strict';

  const GE = () => window.CJS.GridEngine;

  // ── MAIN PICKER ────────────────────────────────────────────────────
  // strategy: string (see header)
  // attacker: the AI unit choosing a target
  // allUnits: all live units (pulled from grid-engine if not provided)
  // opts: { range?: N, requireLoS?: bool, team?: 'enemy'|'player', skillId?: string }
  //
  // Returns: { unit, score } or null
  function pickTarget(strategy, attacker, allUnits, opts = {}) {
    if (!attacker) return null;
    const units = allUnits || (GE() ? GE().getAllUnits() : []);

    const candidates = _filterCandidates(attacker, units, strategy, opts);
    if (!candidates.length) return null;

    switch (strategy) {
      case 'nearest_enemy':        return _best(candidates, u => -_dist(attacker, u));
      case 'furthest_enemy':       return _best(candidates, u =>  _dist(attacker, u));
      case 'lowest_hp_enemy':      return _best(candidates, u => -u.currentHP);
      case 'highest_hp_enemy':     return _best(candidates, u =>  u.currentHP);
      case 'lowest_hp_ally':       return _best(candidates, u => -u.currentHP);
      case 'highest_hp_ally':      return _best(candidates, u =>  u.currentHP);
      case 'lowest_hp_adjacent':   return _best(candidates, u => -u.currentHP,
                                       u => _dist(attacker, u) <= 1);
      case 'random_enemy':
      case 'random_ally':          return { unit: candidates[Math.floor(Math.random() * candidates.length)], score: 0 };

      case 'most_clustered':
        // Pick the target with the most allies (of target) nearby — good for AoE.
        return _best(candidates, u => _clusterScore(u, units));

      case 'squishiest':
        // Low HP + low DR = squishy
        return _best(candidates, u => -(u.currentHP + (u.dr?.physical || 0) * 3 + (u.dr?.magic || 0) * 3));

      case 'most_threatening':
        // High S and/or I with low range = close-range threat; +high current HP
        return _best(candidates, u =>
          (u.compiledStats?.S || 0) + (u.compiledStats?.I || 0) * 0.8 + (u.currentHP / 10)
        );

      case 'lowest_dr_enemy':
        return _best(candidates, u => -((u.dr?.physical || 0) + (u.dr?.magic || 0) + (u.dr?.chaos || 0)));

      case 'highest_damage_enemy':
        // Rough approximation: S + damage flat bonuses
        return _best(candidates, u =>
          (u.compiledStats?.S || 0) + (u.damageFlat || 0) + (u.damagePercent || 0) * 0.5
        );

      default:
        // Unknown strategy: default to nearest enemy
        return _best(candidates, u => -_dist(attacker, u));
    }
  }

  // ── CANDIDATE FILTERING ────────────────────────────────────────────
  function _filterCandidates(attacker, units, strategy, opts) {
    const wantAlly = strategy.includes('ally') || strategy === 'random_ally';
    const team = opts.team || (wantAlly ? attacker.team : _oppositeTeam(attacker.team));

    let c = units.filter(u =>
      u !== attacker && (u.currentHP || 0) > 0 &&
      (u.team === team || !u.team)
    );

    if (opts.range !== undefined && GE()) {
      c = c.filter(u => _dist(attacker, u) <= opts.range);
    }
    if (opts.requireLoS && GE()) {
      c = c.filter(u =>
        GE().hasLineOfSight(attacker.pos[0], attacker.pos[1], u.pos[0], u.pos[1], attacker.instanceId)
      );
    }
    return c;
  }

  function _oppositeTeam(team) {
    if (team === 'player') return 'enemy';
    if (team === 'enemy')  return 'player';
    return 'enemy'; // neutral → enemies default to enemy
  }

  // ── SCORING ────────────────────────────────────────────────────────
  // Pick the candidate with the highest scoreFn value. Optional prefilter.
  function _best(candidates, scoreFn, prefilter) {
    const pool = prefilter ? candidates.filter(prefilter) : candidates;
    if (!pool.length) return null;
    let best = pool[0];
    let bestScore = scoreFn(best);
    for (let i = 1; i < pool.length; i++) {
      const s = scoreFn(pool[i]);
      if (s > bestScore) { best = pool[i]; bestScore = s; }
    }
    return { unit: best, score: bestScore };
  }

  function _dist(a, b) {
    if (!GE() || !a || !b) return 0;
    return GE().footprintDistance(a, b);
  }

  // How many of `target`'s allies are within 2 cells of target? (good for AoE)
  function _clusterScore(target, allUnits) {
    if (!GE()) return 0;
    let count = 0;
    for (const u of allUnits) {
      if (u === target || u.team !== target.team || (u.currentHP || 0) <= 0) continue;
      if (GE().footprintDistance(u, target) <= 2) count++;
    }
    return count;
  }

  // ── CELL TARGETING (for AoE skills that target cells, not units) ──
  // Find the cell whose AoE-at-size covers the most enemies of attacker.
  function bestAoECell(attacker, aoeShape, aoeSize, range, opts = {}) {
    if (!GE() || !attacker) return null;
    const AoE = window.CJS.AoE;
    if (!AoE) return null;
    const dims = GE().getDims();
    const all = GE().getAllUnits();
    const enemyTeam = _oppositeTeam(attacker.team);

    let bestCell = null;
    let bestScore = -1;
    for (let r = 0; r < dims.height; r++) {
      for (let c = 0; c < dims.width; c++) {
        if (GE().distance(attacker.pos[0], attacker.pos[1], r, c) > range) continue;
        if (opts.requireLoS && !GE().hasLineOfSight(attacker.pos[0], attacker.pos[1], r, c, attacker.instanceId)) continue;
        const cells = AoE.getCellsForShape(aoeShape, [r, c], aoeSize, null, dims.width, dims.height);
        const hits = AoE.unitsInCells(cells, GE());
        const score = hits.filter(u => u.team === enemyTeam && (u.currentHP||0) > 0).length
                    - hits.filter(u => u.team === attacker.team).length * 0.5;
        if (score > bestScore) { bestScore = score; bestCell = [r, c]; }
      }
    }
    return bestCell ? { cell: bestCell, score: bestScore } : null;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    pickTarget,
    bestAoECell
  });
})();
