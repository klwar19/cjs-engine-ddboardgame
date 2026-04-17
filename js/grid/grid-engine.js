// grid-engine.js
// Spatial foundation: grid state, occupancy (multi-cell footprint aware),
// movement validation, knockback resolution, line of sight.
// Reads: constants.js, formulas.js
// Used by: combat-manager, action-handler, effect-resolver, ai-controller
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.GridEngine = (() => {
  'use strict';

  const C = () => window.CJS.CONST;
  const F = () => window.CJS.Formulas;

  // ── INTERNAL STATE (per combat instance) ───────────────────────────
  let _width = 8;
  let _height = 8;
  let _cells = [];     // [r][c] → terrain type string ('empty', 'fire_zone'...)
  let _occupancy = []; // [r][c] → unitId or null (multi-cell units fill every cell they cover)
  let _units = {};     // unitId → { pos: [r,c], size: '1x1', ...ref to unit object }

  // ── INIT FROM ENCOUNTER ────────────────────────────────────────────
  // encounter: { grid: [[terrain]], units: [{ id, pos, size }], width, height }
  // unitObjects: { unitId → compiled unit object } so we can resolve size etc.
  function init(encounter, unitObjects) {
    _width = encounter.width || 8;
    _height = encounter.height || 8;

    // Deep copy terrain grid
    _cells = Array.from({ length: _height }, (_, r) =>
      Array.from({ length: _width }, (_, c) =>
        encounter.grid?.[r]?.[c] || 'empty'
      )
    );

    // Init empty occupancy
    _occupancy = Array.from({ length: _height }, () => Array(_width).fill(null));
    _units = {};

    // Place units from encounter
    for (const placement of (encounter.units || [])) {
      const unit = unitObjects[placement.id];
      if (!unit) continue;
      const size = placement.size || unit.size || '1x1';
      _placeUnit(placement.id, placement.pos[0], placement.pos[1], size);
      // Mutate the compiled unit in place so combat-manager and grid-engine
      // share the same object reference (pos updates are visible everywhere).
      unit.instanceId = placement.id;
      unit.pos = [placement.pos[0], placement.pos[1]];
      unit.size = size;
      _units[placement.id] = unit;
    }
  }

  // ── INTERNAL: FOOTPRINT HELPERS ────────────────────────────────────
  function _footprint(size) {
    return C().UNIT_SIZES[size || '1x1'] || { w: 1, h: 1 };
  }

  // Iterate over every cell a unit occupies at (r, c) with given size
  function _forEachCell(r, c, size, fn) {
    const sz = _footprint(size);
    for (let dr = 0; dr < sz.h; dr++) {
      for (let dc = 0; dc < sz.w; dc++) {
        fn(r + dr, c + dc);
      }
    }
  }

  function _inBounds(r, c) {
    return r >= 0 && r < _height && c >= 0 && c < _width;
  }

  function _fitsInBounds(r, c, size) {
    const sz = _footprint(size);
    return r >= 0 && c >= 0 && r + sz.h <= _height && c + sz.w <= _width;
  }

  // ── PLACEMENT / REMOVAL (internal) ─────────────────────────────────
  function _placeUnit(unitId, r, c, size) {
    _forEachCell(r, c, size, (rr, cc) => {
      if (_inBounds(rr, cc)) _occupancy[rr][cc] = unitId;
    });
  }

  function _removeUnit(unitId) {
    for (let r = 0; r < _height; r++) {
      for (let c = 0; c < _width; c++) {
        if (_occupancy[r][c] === unitId) _occupancy[r][c] = null;
      }
    }
  }

  // ── PUBLIC QUERIES ────────────────────────────────────────────────

  function getCell(r, c) {
    if (!_inBounds(r, c)) return null;
    return { terrain: _cells[r][c], unitId: _occupancy[r][c] };
  }

  function getTerrain(r, c) {
    return _inBounds(r, c) ? _cells[r][c] : null;
  }

  function getUnitAt(r, c) {
    if (!_inBounds(r, c)) return null;
    const id = _occupancy[r][c];
    return id ? _units[id] : null;
  }

  function getUnit(unitId) {
    return _units[unitId] || null;
  }

  function getAllUnits() {
    return Object.values(_units).filter(u => (u.currentHP ?? 1) > 0);
  }

  function getAliveUnitsByTeam(team) {
    return getAllUnits().filter(u => u.team === team);
  }

  function getDims() {
    return { width: _width, height: _height };
  }

  // ── DISTANCE (Chebyshev — 8-directional, reasonable for grid combat) ─
  // Use unit anchors (top-left) for distance. For huge units, this is a
  // slight simplification but keeps things fast and predictable.
  function distance(r1, c1, r2, c2) {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
  }

  function distanceBetween(unitA, unitB) {
    if (!unitA || !unitB) return Infinity;
    return distance(unitA.pos[0], unitA.pos[1], unitB.pos[0], unitB.pos[1]);
  }

  // Closest distance between two footprints (for multi-cell units)
  function footprintDistance(unitA, unitB) {
    if (!unitA || !unitB) return Infinity;
    const szA = _footprint(unitA.size);
    const szB = _footprint(unitB.size);
    let best = Infinity;
    for (let r1 = unitA.pos[0]; r1 < unitA.pos[0] + szA.h; r1++) {
      for (let c1 = unitA.pos[1]; c1 < unitA.pos[1] + szA.w; c1++) {
        for (let r2 = unitB.pos[0]; r2 < unitB.pos[0] + szB.h; r2++) {
          for (let c2 = unitB.pos[1]; c2 < unitB.pos[1] + szB.w; c2++) {
            const d = distance(r1, c1, r2, c2);
            if (d < best) best = d;
          }
        }
      }
    }
    return best;
  }

  function isAdjacent(unitA, unitB) {
    return footprintDistance(unitA, unitB) === 1;
  }

  // ── MOVEMENT VALIDATION ────────────────────────────────────────────
  // Validates a MOVE (not a teleport — must have a walkable path).
  // Range is measured in movement points (with terrain costs).
  // Returns: { valid: bool, reason: string, cost?: number, path?: [[r,c],...] }
  function isValidMove(unitId, targetR, targetC) {
    const unit = _units[unitId];
    if (!unit) return { valid: false, reason: 'Unit not found' };
    const [curR, curC] = unit.pos;
    if (curR === targetR && curC === targetC) {
      return { valid: false, reason: 'Already there' };
    }

    if (!_fitsInBounds(targetR, targetC, unit.size)) {
      return { valid: false, reason: 'Out of bounds' };
    }

    // Every cell of target footprint must be passable + either empty
    // or currently occupied by THIS unit (allows partial overlap when moving).
    const sz = _footprint(unit.size);
    for (let dr = 0; dr < sz.h; dr++) {
      for (let dc = 0; dc < sz.w; dc++) {
        const tr = targetR + dr, tc = targetC + dc;
        const td = C().TERRAIN_TYPES[_cells[tr][tc]];
        if (td && !td.passable) {
          return { valid: false, reason: 'Impassable terrain' };
        }
        const occ = _occupancy[tr][tc];
        if (occ && occ !== unitId) {
          return { valid: false, reason: 'Cell occupied' };
        }
      }
    }

    // Check movement range via pathfinding
    const maxMP = unit.movement || 3;
    const PF = window.CJS.Pathfinding;
    if (!PF) {
      return { valid: true, reason: 'ok (no pathfinder)', cost: 0, path: [[targetR, targetC]] };
    }
    const path = PF.findPath({
      from: [curR, curC],
      to: [targetR, targetC],
      maxMP,
      unitId,
      size: unit.size,
      grid: _cells,
      occupancy: _occupancy,
      width: _width,
      height: _height
    });
    if (!path) {
      return { valid: false, reason: 'No path or out of movement range' };
    }
    return { valid: true, reason: 'ok', cost: path.cost, path: path.cells };
  }

  // ── MOVE EXECUTION ─────────────────────────────────────────────────
  // Returns: { success, terrainEffects[], reason? }
  // terrainEffects: list of { terrainType, r, c } for cells entered this move,
  //   so effect-resolver can fire 'on_move' + apply terrain effects.
  function moveUnit(unitId, targetR, targetC) {
    const check = isValidMove(unitId, targetR, targetC);
    if (!check.valid) return { success: false, reason: check.reason };

    const unit = _units[unitId];
    _removeUnit(unitId);
    _placeUnit(unitId, targetR, targetC, unit.size);
    unit.pos = [targetR, targetC];

    // Collect terrain effects for every cell the unit passed through
    // (including destination, excluding origin)
    const terrainEffects = [];
    const seen = new Set();
    for (const [r, c] of (check.path || [[targetR, targetC]])) {
      // For multi-cell units, the anchor pass-through matters most; per-cell
      // terrain effects fire for anchor cell only to avoid double-triggering.
      const key = `${r},${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = _cells[r][c];
      const td = C().TERRAIN_TYPES[t];
      if (td && td.effect) {
        terrainEffects.push({ terrainType: t, effectId: td.effect, r, c });
      }
    }

    return { success: true, terrainEffects, cost: check.cost || 0 };
  }

  // Teleport (ignores path — used by teleport effects, dash skills, etc.)
  // Still enforces bounds + occupancy + passable terrain.
  function teleportUnit(unitId, targetR, targetC) {
    const unit = _units[unitId];
    if (!unit) return { success: false, reason: 'Unit not found' };

    if (!_fitsInBounds(targetR, targetC, unit.size)) {
      return { success: false, reason: 'Out of bounds' };
    }
    const sz = _footprint(unit.size);
    for (let dr = 0; dr < sz.h; dr++) {
      for (let dc = 0; dc < sz.w; dc++) {
        const tr = targetR + dr, tc = targetC + dc;
        const td = C().TERRAIN_TYPES[_cells[tr][tc]];
        if (td && !td.passable) return { success: false, reason: 'Impassable terrain' };
        const occ = _occupancy[tr][tc];
        if (occ && occ !== unitId) return { success: false, reason: 'Cell occupied' };
      }
    }

    _removeUnit(unitId);
    _placeUnit(unitId, targetR, targetC, unit.size);
    unit.pos = [targetR, targetC];
    return { success: true };
  }

  // ── GET VALID MOVES (for UI highlighting) ─────────────────────────
  function getValidMoves(unitId) {
    const unit = _units[unitId];
    if (!unit) return [];
    const PF = window.CJS.Pathfinding;
    if (!PF) return [];
    return PF.reachableCells({
      from: unit.pos,
      maxMP: unit.movement || 3,
      unitId,
      size: unit.size,
      grid: _cells,
      occupancy: _occupancy,
      width: _width,
      height: _height
    });
  }

  // ── LINE OF SIGHT (Bresenham) ──────────────────────────────────────
  // Returns true if cell (r1,c1) can "see" (r2,c2) — for ranged attacks.
  function hasLineOfSight(r1, c1, r2, c2, ignoreUnitId) {
    const line = bresenham(r1, c1, r2, c2);
    // Skip first (attacker) and last (target) cells
    for (let i = 1; i < line.length - 1; i++) {
      const [r, c] = line[i];
      const terrain = _cells[r][c];
      const occId = _occupancy[r][c];
      const occ = (occId && occId !== ignoreUnitId) ? _units[occId] : null;
      if (F().cellBlocksLoS(terrain, occ)) return false;
    }
    return true;
  }

  function bresenham(r1, c1, r2, c2) {
    const points = [];
    let dr = Math.abs(r2 - r1), dc = Math.abs(c2 - c1);
    let sr = r1 < r2 ? 1 : -1, sc = c1 < c2 ? 1 : -1;
    let err = dc - dr;
    let r = r1, c = c1;
    while (true) {
      points.push([r, c]);
      if (r === r2 && c === c2) break;
      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c += sc; }
      if (e2 <  dc) { err += dc; r += sr; }
    }
    return points;
  }

  // ── RANGE QUERIES ─────────────────────────────────────────────────

  // Units within Chebyshev `range` of (r, c) — anchor-based for speed
  function getUnitsInRange(r, c, range, opts = {}) {
    const result = [];
    for (const u of Object.values(_units)) {
      if ((u.currentHP ?? 1) <= 0) continue;
      if (opts.team && u.team !== opts.team) continue;
      if (opts.excludeId && u.instanceId === opts.excludeId) continue;
      const d = distance(r, c, u.pos[0], u.pos[1]);
      if (d <= range) result.push({ unit: u, distance: d });
    }
    return result;
  }

  // All cells within Chebyshev `range` of (r, c)
  function getCellsInRange(r, c, range, opts = {}) {
    const cells = [];
    for (let rr = r - range; rr <= r + range; rr++) {
      for (let cc = c - range; cc <= c + range; cc++) {
        if (!_inBounds(rr, cc)) continue;
        if (opts.requireLoS && !hasLineOfSight(r, c, rr, cc)) continue;
        cells.push([rr, cc]);
      }
    }
    return cells;
  }

  // ── KNOCKBACK ─────────────────────────────────────────────────────
  // Knockback a unit in direction [dr, dc] up to `distance` cells.
  // Returns { finalPos, distanceMoved, collisions[] }
  //   collisions: [{ type: 'wall'|'unit', withId?, r, c }]
  function knockback(unitId, dirR, dirC, dist) {
    const unit = _units[unitId];
    if (!unit) return null;

    // Apply END resistance
    const endStat = unit.compiledStats?.E ?? unit.stats?.E ?? 0;
    const effectiveDist = F().calcKnockbackDistance(dist, endStat);
    if (effectiveDist <= 0) {
      return { finalPos: unit.pos, distanceMoved: 0, collisions: [] };
    }

    const collisions = [];
    let curR = unit.pos[0], curC = unit.pos[1];
    let moved = 0;

    // Step one cell at a time
    _removeUnit(unitId);
    for (let step = 0; step < effectiveDist; step++) {
      const nextR = curR + dirR, nextC = curC + dirC;
      const sz = _footprint(unit.size);

      // Bounds & terrain check for the footprint at next step
      let blocked = false;
      let blockType = null;
      let blockerId = null;

      if (!_fitsInBounds(nextR, nextC, unit.size)) {
        blocked = true; blockType = 'wall';
      } else {
        for (let dr = 0; dr < sz.h && !blocked; dr++) {
          for (let dc = 0; dc < sz.w && !blocked; dc++) {
            const tr = nextR + dr, tc = nextC + dc;
            const terr = C().TERRAIN_TYPES[_cells[tr][tc]];
            if (terr && !terr.passable) {
              blocked = true; blockType = 'wall';
            }
            const occ = _occupancy[tr][tc];
            if (occ && occ !== unitId) {
              blocked = true; blockType = 'unit'; blockerId = occ;
            }
          }
        }
      }

      if (blocked) {
        if (blockType === 'wall') {
          collisions.push({ type: 'wall', r: nextR, c: nextC });
        } else {
          collisions.push({ type: 'unit', withId: blockerId, r: nextR, c: nextC });
        }
        break;
      }

      curR = nextR; curC = nextC; moved++;
    }

    _placeUnit(unitId, curR, curC, unit.size);
    unit.pos = [curR, curC];
    return { finalPos: [curR, curC], distanceMoved: moved, collisions };
  }

  // Apply knockback damage based on collision results.
  // Returns array of { unitId, damage, reason } for damage-calc to apply.
  function resolveKnockbackCollisions(pushedUnitId, collisions, sourceDamage) {
    const hits = [];
    for (const col of collisions) {
      if (col.type === 'wall') {
        hits.push({
          unitId: pushedUnitId,
          damage: F().calcWallCollisionDamage(sourceDamage || 0),
          reason: 'wall_collision'
        });
      } else if (col.type === 'unit') {
        const dmg = F().calcUnitCollisionDamage(sourceDamage || 0);
        hits.push({ unitId: pushedUnitId, damage: dmg, reason: 'unit_collision' });
        hits.push({ unitId: col.withId,    damage: dmg, reason: 'unit_collision' });
      }
    }
    return hits;
  }

  // ── UNIT LIFECYCLE ────────────────────────────────────────────────
  function removeFromBoard(unitId) {
    _removeUnit(unitId);
    if (_units[unitId]) _units[unitId].removed = true;
  }

  function addUnit(unitObject, r, c, size) {
    if (!_fitsInBounds(r, c, size)) return false;
    const sz = _footprint(size);
    for (let dr = 0; dr < sz.h; dr++) {
      for (let dc = 0; dc < sz.w; dc++) {
        if (_occupancy[r + dr][c + dc]) return false;
      }
    }
    unitObject.pos = [r, c];
    unitObject.size = size;
    _units[unitObject.instanceId] = unitObject;
    _placeUnit(unitObject.instanceId, r, c, size);
    return true;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    init,
    // Queries
    getCell, getTerrain, getUnitAt, getUnit, getAllUnits,
    getAliveUnitsByTeam, getDims,
    // Distance
    distance, distanceBetween, footprintDistance, isAdjacent,
    // Movement
    isValidMove, moveUnit, teleportUnit, getValidMoves,
    // Line of sight
    hasLineOfSight, bresenham,
    // Range queries
    getUnitsInRange, getCellsInRange,
    // Knockback
    knockback, resolveKnockbackCollisions,
    // Lifecycle
    removeFromBoard, addUnit
  });
})();
