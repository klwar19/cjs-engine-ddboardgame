// dice.ts — Tier 3 TS port of js/core/dice.js (engine cluster: core).
// Dice rolling: parse "2d6+3", roll, min/max/average calculations.
// Pure functions — no state, no imports. Used by value-calc, damage-calc,
// combat-manager (all via window.CJS.Dice).
//
// This module exports a typed `Dice` API (so future TS consumers can import it
// directly) AND installs `window.CJS.Dice` as a side effect, so the existing
// window.CJS.* consumers and the vanilla engine keep working unchanged. Vite
// bundles it via the side-effect import in each main.tsx; the Node test
// harnesses load it through tools/test/engine-source.cjs (transpile +
// sandbox-wrap), so the same install runs there too.

// ── PARSE DICE STRING ──────────────────────────────────────────────────
// Supports: "2d6", "2d6+3", "2d6-1", "1d20", "3d4+2", "5" (flat).
function parse(diceStr: CJSDiceInput): CJSDiceParsed | null {
  if (typeof diceStr === "number") {
    return { count: 0, sides: 0, modifier: diceStr };
  }
  if (typeof diceStr === "object" && diceStr !== null) {
    // Already parsed.
    return diceStr;
  }
  const str = String(diceStr).trim().toLowerCase();

  // Flat number.
  if (/^-?\d+$/.test(str)) {
    return { count: 0, sides: 0, modifier: parseInt(str, 10) };
  }

  // XdY or XdY+Z or XdY-Z.
  const match = str.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return null;

  return {
    count: parseInt(match[1], 10),
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0
  };
}

// ── ROLL ────────────────────────────────────────────────────────────────
// Roll a dice expression. Returns a zero-result if the expression is invalid.
function roll(diceInput: CJSDiceInput): CJSDiceResult {
  const d =
    typeof diceInput === "string" || typeof diceInput === "number"
      ? parse(diceInput)
      : diceInput;

  if (!d) return { total: 0, rolls: [], modifier: 0, expression: "?" };

  const rolls: number[] = [];
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

// Roll the same expression multiple times.
function rollMultiple(diceInput: CJSDiceInput, times: number): CJSDiceResult[] {
  const results: CJSDiceResult[] = [];
  for (let i = 0; i < times; i++) {
    results.push(roll(diceInput));
  }
  return results;
}

// ── STATISTICS ────────────────────────────────────────────────────────────
function min(diceInput: CJSDiceInput): number {
  const d = typeof diceInput === "string" ? parse(diceInput) : (diceInput as CJSDiceParsed | null);
  if (!d) return 0;
  return d.count * 1 + d.modifier; // each die rolls 1
}

function max(diceInput: CJSDiceInput): number {
  const d = typeof diceInput === "string" ? parse(diceInput) : (diceInput as CJSDiceParsed | null);
  if (!d) return 0;
  return d.count * d.sides + d.modifier;
}

function average(diceInput: CJSDiceInput): number {
  const d = typeof diceInput === "string" ? parse(diceInput) : (diceInput as CJSDiceParsed | null);
  if (!d) return 0;
  return d.count * ((d.sides + 1) / 2) + d.modifier;
}

// Canonicalise a dice expression to its "XdY+Z" string form.
function toString(diceInput: CJSDiceInput): string {
  const d = typeof diceInput === "string" ? parse(diceInput) : (diceInput as CJSDiceParsed | null);
  if (!d) return "?";
  if (d.count === 0) return String(d.modifier);

  let str = `${d.count}d${d.sides}`;
  if (d.modifier > 0) str += `+${d.modifier}`;
  else if (d.modifier < 0) str += String(d.modifier);
  return str;
}

// ── QUICK ROLLS (convenience) ──────────────────────────────────────────────
function d20(): number { return Math.floor(Math.random() * 20) + 1; }
function d12(): number { return Math.floor(Math.random() * 12) + 1; }
function d10(): number { return Math.floor(Math.random() * 10) + 1; }
function d8(): number { return Math.floor(Math.random() * 8) + 1; }
function d6(): number { return Math.floor(Math.random() * 6) + 1; }
function d4(): number { return Math.floor(Math.random() * 4) + 1; }
function d100(): number { return Math.floor(Math.random() * 100) + 1; }

// Inclusive integer range roll.
function range(minVal: number, maxVal: number): number {
  return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
}

// Weighted random pick from { key: weight } map.
// e.g. { EASY: 0.7, MEDIUM: 0.3 } picks EASY 70% of the time.
function weightedPick<K extends string>(weightMap: Record<K, number>): K | null {
  const entries = (Object.entries(weightMap) as Array<[K, number]>).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total === 0) return entries[0]?.[0] ?? null;

  let r = Math.random() * total;
  for (const [key, weight] of entries) {
    r -= weight;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

// ── PUBLIC API ────────────────────────────────────────────────────────────
export const Dice: CJSDice = Object.freeze({
  parse,
  roll,
  rollMultiple,
  min,
  max,
  average,
  toString,
  d4,
  d6,
  d8,
  d10,
  d12,
  d20,
  d100,
  range,
  weightedPick
});

// Runtime compatibility install — keep window.CJS.Dice identical to the legacy
// IIFE so every existing consumer (and the vanilla engine) is unchanged.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.Dice = Dice;
