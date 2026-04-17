// dice-service.js
// A thin layer over Dice that respects CombatSettings.diceMode.
// Keeps the low-level Dice module pure; combat code uses DiceService
// so manual/queued rolls work the same way everywhere.
//
// Mode behavior:
//   'auto'   → calls Dice.roll() directly
//   'queued' → pops next value from queue, falls back to auto if empty
//   'prompt' → calls registered prompt function; prompt can return number
//              (sync) or Promise<number> (use rollAsync in that case)
//
// Reads: dice.js, combat-settings.js, combat-log.js
// Used by: damage-calc.js, value-calc.js, combat-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.DiceService = (() => {
  'use strict';

  const Dice = () => window.CJS.Dice;
  const CS   = () => window.CJS.CombatSettings;
  const Log  = () => window.CJS.CombatLog;

  // ── CORE: ROLL (sync) ──────────────────────────────────────────────
  // expression: "2d6+3" or "1d20" or number, same as Dice.roll
  // source: label for the history log ("attack_roll", "burn_dice", etc.)
  //
  // Returns: { total, rolls[], modifier, expression, source, manual? }
  function roll(expression, source) {
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
  async function rollAsync(expression, source) {
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

  function _record(result) {
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

  // ── CONVENIENCE WRAPPERS ──────────────────────────────────────────
  function d20(source) { return roll('1d20', source || 'd20'); }
  function d12(source) { return roll('1d12', source || 'd12'); }
  function d10(source) { return roll('1d10', source || 'd10'); }
  function d8(source)  { return roll('1d8',  source || 'd8'); }
  function d6(source)  { return roll('1d6',  source || 'd6'); }
  function d4(source)  { return roll('1d4',  source || 'd4'); }

  // Crit-check via percentile — not dice-roll per se, but also routed here
  // so manual mode can override it.
  function percentile(source) { return roll('1d100', source || 'd100'); }

  // Preview (for UI): "what would this roll show on average?" — doesn't
  // consume the queue or prompt.
  function preview(expression) {
    return Dice().average(expression);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    roll, rollAsync,
    d20, d12, d10, d8, d6, d4, percentile,
    preview
  });
})();
