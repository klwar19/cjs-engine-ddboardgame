// dice-service.ts — Tier 3 TS port of js/combat/dice-service.js (engine cluster:
// combat). A thin layer over Dice that respects CombatSettings.diceMode
// (auto/queued/prompt) and records history. Keeps the low-level Dice module pure
// while combat code uses DiceService so manual/queued rolls work everywhere.
//
// Reads: window.CJS Dice/CombatSettings/CombatLog.
// Used by: damage-calc, value-calc, combat-manager.
//
// Exports the typed `DiceService: CJSDiceService` AND installs
// window.CJS.DiceService. Bodies verbatim.

const Dice = () => window.CJS.Dice;
const CS   = (): any => window.CJS.CombatSettings;
const Log  = () => window.CJS.CombatLog;

// ── CORE: ROLL (sync) ──────────────────────────────────────────────
// expression: "2d6+3" or "1d20" or number, same as Dice.roll
// source: label for the history log ("attack_roll", "burn_dice", etc.)
function roll(expression, source?) {
  const mode = CS() ? CS().getDiceMode() : 'auto';

  if (mode === 'queued') {
    const queued = CS().popQueuedDice();
    if (queued !== null) {
      const result = _manualResult(expression, queued, source, 'queued');
      _record(result);
      return result;
    }
    // Fall through to auto
  }

  if (mode === 'prompt') {
    const fn = CS().getDicePromptFn();
    if (fn) {
      try {
        const val = fn(expression, source);
        // If the function returns a Promise, we can't wait synchronously —
        // fall back to auto and let the caller use rollAsync instead.
        if (val && typeof val.then === 'function') {
          console.warn('DiceService.roll: prompt returned Promise; use rollAsync instead. Falling back to auto.');
        } else if (typeof val === 'number') {
          const result = _manualResult(expression, val, source, 'prompt');
          _record(result);
          return result;
        }
      } catch (e) {
        console.error('DiceService prompt error:', e);
      }
    }
  }

  // Default: auto
  const autoResult = Dice().roll(expression);
  autoResult.source = source;
  _record(autoResult);
  return autoResult;
}

// ── ROLL (async) ──────────────────────────────────────────────────
// For UIs that need the user to input dice via a dialog. Returns a Promise
// resolving to the result object.
async function rollAsync(expression, source?) {
  const mode = CS() ? CS().getDiceMode() : 'auto';

  if (mode === 'queued') {
    const queued = CS().popQueuedDice();
    if (queued !== null) {
      const result = _manualResult(expression, queued, source, 'queued');
      _record(result);
      return result;
    }
  }

  if (mode === 'prompt') {
    const fn = CS().getDicePromptFn();
    if (fn) {
      try {
        const val = await fn(expression, source);
        if (typeof val === 'number') {
          const result = _manualResult(expression, val, source, 'prompt');
          _record(result);
          return result;
        }
      } catch (e) {
        console.error('DiceService async prompt error:', e);
      }
    }
  }

  const autoResult = Dice().roll(expression);
  autoResult.source = source;
  _record(autoResult);
  return autoResult;
}

// ── HELPERS ────────────────────────────────────────────────────────
function _manualResult(expression, value, source, via) {
  return {
    total: value, rolls: [], modifier: 0,
    expression: String(expression), source,
    manual: true, via
  };
}

// Last roll cache — used by the Lucky Reroll ultimate to redo the most recent
// dice without changing call sites. Updated on every _record.
let _lastRoll: CJSDiceResult | null = null;

function _record(result) {
  _lastRoll = result;
  if (!CS()) return;
  CS().recordDiceRoll({
    expr: result.expression,
    result: result.total,
    rolls: result.rolls,
    source: result.source,
    manual: !!result.manual,
    via: result.via || 'auto'
  });
}

// Re-roll the most recent dice expression. Returns the new result, or null if no
// previous roll exists. The history is updated as if it were a fresh roll, so
// subsequent reroll calls reroll the freshest dice (not the original).
function rerollLast() {
  if (!_lastRoll || !_lastRoll.expression) return null;
  const previous = _lastRoll;
  const result = Dice().roll(previous.expression);
  result.source = `reroll(${previous.source || ''})`;
  result.rerolled = true;
  _record(result);
  return result;
}

// ── CONVENIENCE WRAPPERS ──────────────────────────────────────────
function d20(source?) { return roll('1d20', source || 'd20'); }
function d12(source?) { return roll('1d12', source || 'd12'); }
function d10(source?) { return roll('1d10', source || 'd10'); }
function d8(source?)  { return roll('1d8',  source || 'd8'); }
function d6(source?)  { return roll('1d6',  source || 'd6'); }
function d4(source?)  { return roll('1d4',  source || 'd4'); }

// Crit-check via percentile — not dice-roll per se, but also routed here so
// manual mode can override it.
function percentile(source?) { return roll('1d100', source || 'd100'); }

// Preview (for UI): "what would this roll show on average?" — doesn't consume
// the queue or prompt.
function preview(expression) {
  return Dice().average(expression);
}

// ── PUBLIC API ─────────────────────────────────────────────────────
export const DiceService: CJSDiceService = Object.freeze({
  roll, rollAsync,
  d20, d12, d10, d8, d6, d4, percentile,
  preview,
  rerollLast
});

// Runtime compatibility install — keep window.CJS.DiceService identical to the
// legacy IIFE so every existing consumer (and the vanilla engine) is unchanged.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.DiceService = DiceService;
