// pathfinding.js
// Movement range + shortest-path search on the combat grid.
// Handles multi-cell units (footprint must fit at every step) and
// per-terrain movement costs.
// Pure functions — accept grid state as arguments, no module state.
// Reads: constants.js (TERRAIN_TYPES, UNIT_SIZES)
// Used by: grid-engine.js, ai-targeting.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.Pathfinding = (() => {
  'use strict';

  const C = () => window.CJS.CONST;

  // ── HELPERS ────────────────────────────────────────────────────────
  function _footprint(size) {
    return C().UNIT_SIZES[size || '1x1'] || { w: 1, h: 1 };
  }

  function _inBounds(r, c, width, height) {
    return r >= 0 && r < height && c >= 0 && c < width;
  }

  // Can a unit of given size stand with its anchor at (r, c)?
  // Ignores its own occupancy (so it can "move through its own cells").
  function _canOccupy(r, c, size, selfId, grid, occupancy, width, height) {
    const sz = _footprint(size);
    if (r < 0 || c < 0 || r + sz.h > height || c + sz.w > width) return false;
    for (let dr = 0; dr < sz.h; dr++) {
      for (let dc = 0; dc < sz.w; dc++) {
        const tr = r + dr, tc = c + dc;
        const tt = C().TERRAIN_TYPES[grid[tr][tc]];
        if (tt && !tt.passable) return false;
        const occ = occupancy[tr][tc];
        if (occ && occ !== selfId) return false;
      }
    }
    return true;
  }

  // What's the movement cost to *enter* cell (r, c) for a unit of given size?
  // We take the MAXIMUM cost across all footprint cells — the slowest cell
  // you're now standing on governs how tiring this step was.
  function _enterCost(r, c, size, grid, width, height) {
    const sz = _footprint(size);
    let worst = 1;
    for (let dr = 0; dr < sz.h; dr++) {
      for (let dc = 0; dc < sz.w; dc++) {
        const tr = r + dr, tc = c + dc;
        if (!_inBounds(tr, tc, width, height)) return Infinity;
        const tt = C().TERRAIN_TYPES[grid[tr][tc]];
        const cost = tt ? tt.moveCost : 1;
        if (cost >= 999) return Infinity;
        if (cost > worst) worst = cost;
      }
    }
    return worst;
  }

  // ── REACHABLE CELLS (Dijkstra — because terrain costs vary) ────────
  // args: { from: [r,c], maxMP, unitId, size, grid, occupancy, width, height }
  // Returns: array of [r, c] anchors reachable within maxMP points.
  function reachableCells(args) {
    const { from, maxMP, unitId, size, grid, occupancy, width, height } = args;
    const [sr, sc] = from;

    // dist[r][c] = min movement-points used to reach anchor at (r,c)
    const dist = Array.from({ length: height }, () => Array(width).fill(Infinity));
    dist[sr][sc] = 0;

    // Simple priority via sorted insert (grid is small, OK)
    const queue = [[0, sr, sc]];

    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [d, r, c] = queue.shift();
      if (d > dist[r][c]) continue;

      // 4-directional movement (no diagonal — cleaner for tactical grids)
      const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of deltas) {
        const nr = r + dr, nc = c + dc;
        if (!_inBounds(nr, nc, width, height)) continue;
        if (!_canOccupy(nr, nc, size, unitId, grid, occupancy, width, height)) continue;
        const stepCost = _enterCost(nr, nc, size, grid, width, height);
        if (!isFinite(stepCost)) continue;
        const nd = d + stepCost;
        if (nd > maxMP) continue;
        if (nd < dist[nr][nc]) {
          dist[nr][nc] = nd;
          queue.push([nd, nr, nc]);
        }
      }
    }

    const cells = [];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (dist[r][c] !== Infinity && !(r === sr && c === sc)) {
          cells.push([r, c]);
        }
      }
    }
    return cells;
  }

  // ── FIND PATH ──────────────────────────────────────────────────────
  // args: { from, to, maxMP, unitId, size, grid, occupancy, width, height }
  // Returns: { cells: [[r,c],...], cost } or null if unreachable within maxMP.
  //   cells includes both endpoints.
  function findPath(args) {
    const { from, to, maxMP, unitId, size, grid, occupancy, width, height } = args;
    const [sr, sc] = from;
    const [tr, tc] = to;

    if (!_canOccupy(tr, tc, size, unitId, grid, occupancy, width, height)) return null;

    const dist = Array.from({ length: height }, () => Array(width).fill(Infinity));
    const prev = Array.from({ length: height }, () => Array(width).fill(null));
    dist[sr][sc] = 0;

    const queue = [[0, sr, sc]];

    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [d, r, c] = queue.shift();
      if (d > dist[r][c]) continue;
      if (r === tr && c === tc) break;

      const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of deltas) {
        const nr = r + dr, nc = c + dc;
        if (!_inBounds(nr, nc, width, height)) continue;
        if (!_canOccupy(nr, nc, size, unitId, grid, occupancy, width, height)) continue;
        const stepCost = _enterCost(nr, nc, size, grid, width, height);
        if (!isFinite(stepCost)) continue;
        const nd = d + stepCost;
        if (nd > maxMP) continue;
        if (nd < dist[nr][nc]) {
          dist[nr][nc] = nd;
          prev[nr][nc] = [r, c];
          queue.push([nd, nr, nc]);
        }
      }
    }

    if (dist[tr][tc] === Infinity) return null;

    // Reconstruct path
    const cells = [];
    let cur = [tr, tc];
    while (cur) {
      cells.unshift(cur);
      cur = prev[cur[0]][cur[1]];
    }
    return { cells, cost: dist[tr][tc] };
  }

  // ── AI PATHING: STEP TOWARD ────────────────────────────────────────
  // Given current pos and destination, return best anchor cell to move to
  // using maxMP this turn. Destination doesn't need to be reachable this turn —
  // we just walk as far toward it as we can.
  function stepToward(args) {
    const { from, to, maxMP, unitId, size, grid, occupancy, width, height } = args;

    // Try a full path ignoring MP limit first (to see if destination is reachable)
    const ideal = findPath({
      ...args, maxMP: width * height * 3  // effectively unlimited
    });
    if (!ideal) return null;

    // Walk along the ideal path as far as MP allows
    let cost = 0;
    let best = [...from];
    for (let i = 1; i < ideal.cells.length; i++) {
      const [r, c] = ideal.cells[i];
      const step = _enterCost(r, c, size, grid, width, height);
      if (!isFinite(step) || cost + step > maxMP) break;
      cost += step;
      best = [r, c];
    }
    if (best[0] === from[0] && best[1] === from[1]) return null;
    return { to: best, cost };
  }

  // ── NEAREST EMPTY CELL ─────────────────────────────────────────────
  // Used for summon placement, teleport-to-nearest, knockback landing, etc.
  function nearestEmptyCell(args) {
    const { near, size, selfId, grid, occupancy, width, height, maxSearch } = args;
    const [sr, sc] = near;
    const limit = maxSearch || Math.max(width, height);

    // Spiral outward by Chebyshev distance
    for (let d = 0; d <= limit; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          // Only check the ring at exactly distance d
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          const r = sr + dr, c = sc + dc;
          if (_canOccupy(r, c, size, selfId, grid, occupancy, width, height)) {
            return [r, c];
          }
        }
      }
    }
    return null;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    reachableCells,
    findPath,
    stepToward,
    nearestEmptyCell
  });
})();
