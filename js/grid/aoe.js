// aoe.js
// AoE shape calculation: circle, line, cone, cross, row, column.
// Returns sets of [r, c] cells for a given shape + origin + parameters.
// Pure functions — accept grid dims as arguments.
// Used by: grid-engine, action-handler, effect-resolver
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AoE = (() => {
  'use strict';

  // ── DIRECTIONS (for cone/line) ─────────────────────────────────────
  // 8-directional: N, NE, E, SE, S, SW, W, NW
  const DIRECTIONS = {
    N:  [-1,  0], NE: [-1,  1], E:  [0,  1], SE: [1,  1],
    S:  [ 1,  0], SW: [ 1, -1], W:  [0, -1], NW: [-1, -1]
  };

  function directionFrom(fromR, fromC, toR, toC) {
    const dr = Math.sign(toR - fromR);
    const dc = Math.sign(toC - fromC);
    if (dr === -1 && dc ===  0) return 'N';
    if (dr === -1 && dc ===  1) return 'NE';
    if (dr ===  0 && dc ===  1) return 'E';
    if (dr ===  1 && dc ===  1) return 'SE';
    if (dr ===  1 && dc ===  0) return 'S';
    if (dr ===  1 && dc === -1) return 'SW';
    if (dr ===  0 && dc === -1) return 'W';
    if (dr === -1 && dc === -1) return 'NW';
    return 'E'; // fallback
  }

  function _inBounds(r, c, w, h) {
    return r >= 0 && r < h && c >= 0 && c < w;
  }

  function _clip(cells, w, h) {
    return cells.filter(([r, c]) => _inBounds(r, c, w, h));
  }

  // ── CIRCLE (radius N, Chebyshev) ───────────────────────────────────
  // Also known as "square" / "blast radius".
  function circle(centerR, centerC, radius, width, height) {
    const cells = [];
    for (let r = centerR - radius; r <= centerR + radius; r++) {
      for (let c = centerC - radius; c <= centerC + radius; c++) {
        cells.push([r, c]);
      }
    }
    return _clip(cells, width, height);
  }

  // Euclidean circle (true round blast)
  function disk(centerR, centerC, radius, width, height) {
    const cells = [];
    const r2 = radius * radius;
    for (let r = centerR - radius; r <= centerR + radius; r++) {
      for (let c = centerC - radius; c <= centerC + radius; c++) {
        const dr = r - centerR, dc = c - centerC;
        if (dr * dr + dc * dc <= r2) cells.push([r, c]);
      }
    }
    return _clip(cells, width, height);
  }

  // ── LINE (from origin, in direction, length N) ─────────────────────
  function line(originR, originC, direction, length, width, height) {
    const [dr, dc] = DIRECTIONS[direction] || DIRECTIONS.E;
    const cells = [];
    for (let i = 1; i <= length; i++) {
      cells.push([originR + dr * i, originC + dc * i]);
    }
    return _clip(cells, width, height);
  }

  // ── CONE (from origin, in direction, size N) ───────────────────────
  // Cone widens by 1 per step (1 cell at distance 1, 3 at distance 2, etc.)
  // For cardinal directions: a triangular wedge.
  // For diagonal directions: quarter-disk.
  function cone(originR, originC, direction, size, width, height) {
    const [dr, dc] = DIRECTIONS[direction] || DIRECTIONS.E;
    const cells = [];
    const isDiagonal = (dr !== 0 && dc !== 0);

    for (let step = 1; step <= size; step++) {
      if (isDiagonal) {
        // Quarter disk: all cells in the quadrant at Chebyshev distance ≤ step
        for (let r = 1; r <= step; r++) {
          for (let c = 1; c <= step; c++) {
            cells.push([originR + dr * r, originC + dc * c]);
          }
        }
      } else {
        // Triangular wedge expanding perpendicular to direction
        if (dr !== 0) {
          // N or S: widen along columns
          for (let w = -step + 1; w <= step - 1; w++) {
            cells.push([originR + dr * step, originC + w]);
          }
        } else {
          // E or W: widen along rows
          for (let h = -step + 1; h <= step - 1; h++) {
            cells.push([originR + h, originC + dc * step]);
          }
        }
      }
    }

    // Dedupe (diagonal cone can overlap at corners)
    const seen = new Set();
    const unique = [];
    for (const [r, c] of cells) {
      const k = `${r},${c}`;
      if (!seen.has(k)) { seen.add(k); unique.push([r, c]); }
    }
    return _clip(unique, width, height);
  }

  // ── CROSS (plus-shape, arms of length N from center) ───────────────
  function cross(centerR, centerC, size, width, height) {
    const cells = [[centerR, centerC]];
    for (let i = 1; i <= size; i++) {
      cells.push([centerR - i, centerC]);
      cells.push([centerR + i, centerC]);
      cells.push([centerR, centerC - i]);
      cells.push([centerR, centerC + i]);
    }
    return _clip(cells, width, height);
  }

  // ── X (diagonal cross) ─────────────────────────────────────────────
  function xShape(centerR, centerC, size, width, height) {
    const cells = [[centerR, centerC]];
    for (let i = 1; i <= size; i++) {
      cells.push([centerR - i, centerC - i]);
      cells.push([centerR - i, centerC + i]);
      cells.push([centerR + i, centerC - i]);
      cells.push([centerR + i, centerC + i]);
    }
    return _clip(cells, width, height);
  }

  // ── ROW / COLUMN ───────────────────────────────────────────────────
  function row(r, width, height) {
    if (r < 0 || r >= height) return [];
    const cells = [];
    for (let c = 0; c < width; c++) cells.push([r, c]);
    return cells;
  }

  function column(c, width, height) {
    if (c < 0 || c >= width) return [];
    const cells = [];
    for (let r = 0; r < height; r++) cells.push([r, c]);
    return cells;
  }

  // ── DISPATCH BY TARGET STRING ──────────────────────────────────────
  // target strings from constants: "aoe_radius", "aoe_line", "aoe_cone", "aoe_cross"
  // Works with effect.aoeShape / effect.aoeSize from the effect template.
  // origin: [r, c], dirOrTarget: direction string OR [r, c] for direction-derivation
  // size: number
  function getCellsForShape(shape, origin, size, dirOrTarget, width, height) {
    const [r, c] = origin;
    switch (shape) {
      case 'radius':
      case 'circle':
      case 'aoe_radius':
        return circle(r, c, size, width, height);
      case 'disk':
        return disk(r, c, size, width, height);
      case 'cross':
      case 'aoe_cross':
        return cross(r, c, size, width, height);
      case 'x':
        return xShape(r, c, size, width, height);
      case 'line':
      case 'aoe_line': {
        const dir = typeof dirOrTarget === 'string'
          ? dirOrTarget
          : Array.isArray(dirOrTarget)
            ? directionFrom(r, c, dirOrTarget[0], dirOrTarget[1])
            : 'E';
        return line(r, c, dir, size, width, height);
      }
      case 'cone':
      case 'aoe_cone': {
        const dir = typeof dirOrTarget === 'string'
          ? dirOrTarget
          : Array.isArray(dirOrTarget)
            ? directionFrom(r, c, dirOrTarget[0], dirOrTarget[1])
            : 'E';
        return cone(r, c, dir, size, width, height);
      }
      case 'same_row':
        return row(r, width, height);
      case 'same_column':
        return column(c, width, height);
      default:
        return [[r, c]];
    }
  }

  // ── GET UNITS FROM CELLS ──────────────────────────────────────────
  // Given a set of cells and a grid engine reference, return unique units.
  function unitsInCells(cells, gridEngine) {
    if (!gridEngine) return [];
    const seen = new Set();
    const units = [];
    for (const [r, c] of cells) {
      const u = gridEngine.getUnitAt(r, c);
      if (u && !seen.has(u.instanceId)) {
        seen.add(u.instanceId);
        units.push(u);
      }
    }
    return units;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    DIRECTIONS, directionFrom,
    circle, disk, line, cone, cross, xShape, row, column,
    getCellsForShape, unitsInCells
  });
})();
