// dice.js
// Dice rolling: parse "2d6+3", roll, min/max/average calculations.
// Pure functions — no state, no imports.
// Used by: value-calc.js, damage-calc.js, combat-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.Dice = (() => {
  'use strict';

  // ── PARSE DICE STRING ──────────────────────────────────────────────
  // Supports: "2d6", "2d6+3", "2d6-1", "1d20", "3d4+2", "5" (flat)
  /**
   * Parse a dice expression into its component parts.
   * @param {CJSDiceInput} diceStr
   * @returns {CJSDiceParsed | null}
   */
  function parse(diceStr) {
    if (typeof diceStr === 'number') {
      return { count: 0, sides: 0, modifier: diceStr };
    }
    if (typeof diceStr === 'object' && diceStr !== null) {
      // Already parsed
      return diceStr;
    }
    const str = String(diceStr).trim().toLowerCase();

    // Flat number
    if (/^-?\d+$/.test(str)) {
      return { count: 0, sides: 0, modifier: parseInt(str, 10) };
    }

    // XdY or XdY+Z or XdY-Z
    const match = str.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match) return null;

    return {
      count:    parseInt(match[1], 10),
      sides:    parseInt(match[2], 10),
      modifier: match[3] ? parseInt(match[3], 10) : 0
    };
  }

  // ── ROLL ───────────────────────────────────────────────────────────
  /**
   * Roll a dice expression. Returns a zero-result if the expression is invalid.
   * @param {CJSDiceInput} diceInput
   * @returns {CJSDiceResult}
   */
  function roll(diceInput) {
    const d = typeof diceInput === 'string' || typeof diceInput === 'number'
      ? parse(diceInput)
      : diceInput;

    if (!d) return { total: 0, rolls: [], modifier: 0, expression: '?' };

    const rolls = [];
    for (let i = 0; i < d.count; i++) {
      rolls.push(Math.floor(Math.random() * d.sides) + 1);
    }

    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + d.modifier;

    return {
      total,
      rolls,
      modifier: d.modifier,
      expression: toString(d)
    };
  }

  /**
   * Roll the same expression multiple times.
   * @param {CJSDiceInput} diceInput
   * @param {number} times
   * @returns {CJSDiceResult[]}
   */
  function rollMultiple(diceInput, times) {
    const results = [];
    for (let i = 0; i < times; i++) {
      results.push(roll(diceInput));
    }
    return results;
  }

  // ── STATISTICS ─────────────────────────────────────────────────────
  /** @param {CJSDiceInput} diceInput @returns {number} */
  function min(diceInput) {
    const d = typeof diceInput === 'string' ? parse(diceInput) : diceInput;
    if (!d) return 0;
    return d.count * 1 + d.modifier; // each die rolls 1
  }

  /** @param {CJSDiceInput} diceInput @returns {number} */
  function max(diceInput) {
    const d = typeof diceInput === 'string' ? parse(diceInput) : diceInput;
    if (!d) return 0;
    return d.count * d.sides + d.modifier;
  }

  /** @param {CJSDiceInput} diceInput @returns {number} */
  function average(diceInput) {
    const d = typeof diceInput === 'string' ? parse(diceInput) : diceInput;
    if (!d) return 0;
    return d.count * ((d.sides + 1) / 2) + d.modifier;
  }

  /**
   * Canonicalise a dice expression to its "XdY+Z" string form.
   * @param {CJSDiceInput} diceInput
   * @returns {string}
   */
  function toString(diceInput) {
    const d = typeof diceInput === 'string' ? parse(diceInput) : diceInput;
    if (!d) return '?';
    if (d.count === 0) return String(d.modifier);

    let str = `${d.count}d${d.sides}`;
    if (d.modifier > 0) str += `+${d.modifier}`;
    else if (d.modifier < 0) str += String(d.modifier);
    return str;
  }

  // ── QUICK ROLLS (convenience) ──────────────────────────────────────
  /** @returns {number} */ function d20()  { return Math.floor(Math.random() * 20) + 1; }
  /** @returns {number} */ function d12()  { return Math.floor(Math.random() * 12) + 1; }
  /** @returns {number} */ function d10()  { return Math.floor(Math.random() * 10) + 1; }
  /** @returns {number} */ function d8()   { return Math.floor(Math.random() * 8) + 1; }
  /** @returns {number} */ function d6()   { return Math.floor(Math.random() * 6) + 1; }
  /** @returns {number} */ function d4()   { return Math.floor(Math.random() * 4) + 1; }
  /** @returns {number} */ function d100() { return Math.floor(Math.random() * 100) + 1; }

  /**
   * Inclusive integer range roll.
   * @param {number} minVal
   * @param {number} maxVal
   * @returns {number}
   */
  function range(minVal, maxVal) {
    return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
  }

  /**
   * Weighted random pick from { key: weight } map.
   * e.g. { EASY: 0.7, MEDIUM: 0.3 } picks EASY 70% of the time.
   * @template {string} K
   * @param {Record<K, number>} weightMap
   * @returns {K | null}
   */
  function weightedPick(weightMap) {
    const entries = Object.entries(weightMap).filter(([, w]) => w > 0);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    if (total === 0) return /** @type {K | null} */ (entries[0]?.[0] || null);

    let r = Math.random() * total;
    for (const [key, weight] of entries) {
      r -= weight;
      if (r <= 0) return /** @type {K} */ (key);
    }
    return /** @type {K} */ (entries[entries.length - 1][0]);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    parse, roll, rollMultiple,
    min, max, average, toString,
    d4, d6, d8, d10, d12, d20, d100,
    range, weightedPick
  });
})();
