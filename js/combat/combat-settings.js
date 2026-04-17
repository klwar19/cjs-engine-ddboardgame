// combat-settings.js
// Central runtime settings for combat: who controls which unit (AI vs
// manual), and how dice rolls are resolved (auto vs prompt vs queued).
//
// Other modules read from here; the UI writes to it via toggles.
//
// Reads: nothing
// Used by: combat-manager, dice-service, action-handler
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.CombatSettings = (() => {
  'use strict';

  // ── CONTROL MODE ───────────────────────────────────────────────────
  // 'ai'     — AI controller picks the action
  // 'manual' — user picks via UI (same flow as player turn)
  //
  // Priority:
  //   1. unitControl[unitId] if set
  //   2. teamControl[teamName] if set
  //   3. global defaultControl
  //
  // Player team is always 'manual' unless explicitly overridden.

  let _unitControl = {};                    // { unitId: 'ai' | 'manual' }
  let _teamControl = { player: 'manual' };  // { teamName: 'ai' | 'manual' }
  let _defaultControl = 'manual';           // Manual-first: click Auto to delegate

  function setUnitControl(unitId, mode) {
    if (!unitId) return;
    if (mode === null || mode === undefined) delete _unitControl[unitId];
    else _unitControl[unitId] = mode;
  }

  function setTeamControl(team, mode) {
    if (mode === null || mode === undefined) delete _teamControl[team];
    else _teamControl[team] = mode;
  }

  function setDefaultControl(mode) {
    _defaultControl = mode === 'manual' ? 'manual' : 'ai';
  }

  function getControlMode(unit) {
    if (!unit) return _defaultControl;
    const id = unit.instanceId || unit.id;
    if (_unitControl[id]) return _unitControl[id];
    if (unit.team && _teamControl[unit.team]) return _teamControl[unit.team];
    return _defaultControl;
  }

  function isManual(unit) { return getControlMode(unit) === 'manual'; }
  function isAI(unit)     { return getControlMode(unit) === 'ai'; }

  // ── DICE MODE ──────────────────────────────────────────────────────
  // 'auto'   — normal Math.random
  // 'queued' — pop values from _diceQueue in order; fall back to auto when empty
  // 'prompt' — call _dicePromptFn(expression, context) and use its return
  //
  // 'prompt' can be sync (return a number) or async (return a Promise<number>).
  // Async prompt requires the caller to await — DiceService.rollAsync is for that.

  let _diceMode = 'auto';
  let _diceQueue = [];
  let _dicePromptFn = null;
  let _diceHistory = [];   // audit log of recent rolls: { expr, result, source }

  function setDiceMode(mode) {
    if (['auto', 'queued', 'prompt'].includes(mode)) _diceMode = mode;
  }

  function getDiceMode() { return _diceMode; }

  function queueDice(values) {
    if (Array.isArray(values)) _diceQueue.push(...values);
    else _diceQueue.push(values);
  }

  function popQueuedDice() {
    return _diceQueue.length ? _diceQueue.shift() : null;
  }

  function clearDiceQueue() { _diceQueue = []; }

  function diceQueueLength() { return _diceQueue.length; }

  function setDicePromptFn(fn) { _dicePromptFn = fn; }

  function getDicePromptFn() { return _dicePromptFn; }

  function recordDiceRoll(entry) {
    _diceHistory.push({ ...entry, timestamp: Date.now() });
    if (_diceHistory.length > 200) _diceHistory.shift();
  }

  function getDiceHistory() { return [..._diceHistory]; }

  // ── ONE-SHOT AUTO ──────────────────────────────────────────────────
  // Separate from the base control mode: a transient "let AI resolve this"
  // request. Base mode stays manual by default; when the scope expires,
  // this clears itself automatically and control returns to the user.
  //
  // Scopes:
  //   'turn'        — only the unit whose turn it is NOW. Clears at turn_end.
  //   'round'       — every unit's turn until we loop back to the initial
  //                   turnIndex. Combat-manager calls tickAutoScope() each
  //                   turn_start to track this.
  //   'until_stop'  — runs forever until stopAuto() is called.
  //
  // Combat-manager consumes this via shouldAutoThisTurn(unit, turnIndex).

  let _autoScope = null;           // 'turn' | 'round' | 'until_stop' | null
  let _autoStartTurnIndex = null;  // set when 'round' scope begins
  let _autoForUnitId = null;       // set when 'turn' scope begins

  function requestAuto(scope, ctx) {
    _autoScope = scope || 'turn';
    if (_autoScope === 'turn') {
      _autoForUnitId = ctx?.unitId || null;
    } else if (_autoScope === 'round') {
      _autoStartTurnIndex = ctx?.turnIndex ?? 0;
    }
  }

  function stopAuto() {
    _autoScope = null;
    _autoStartTurnIndex = null;
    _autoForUnitId = null;
  }

  function getAutoScope() { return _autoScope; }

  function isAutoActive() { return _autoScope !== null; }

  // Called by combat-manager at turn_start to check if scope has expired.
  function tickAutoScope(ctx) {
    if (!_autoScope) return;
    if (_autoScope === 'turn') {
      // 'turn' scope clears itself as soon as we move past the unit it was for.
      if (!ctx || ctx.unitId !== _autoForUnitId) {
        stopAuto();
      }
    } else if (_autoScope === 'round') {
      // 'round' clears when we come back around to the starting turnIndex
      // (but not on the very first tick — that IS the starting turn).
      if (ctx && ctx.turnIndex === _autoStartTurnIndex && ctx.rounds > 0) {
        stopAuto();
      }
    }
    // 'until_stop' never clears automatically.
  }

  // The real question combat-manager asks:
  // "Should this unit's turn run on AI right now?"
  function shouldAutoThisTurn(unit) {
    if (!_autoScope) return false;
    if (_autoScope === 'turn') {
      if (!_autoForUnitId) return true;  // generic "auto next turn"
      return (unit.instanceId || unit.id) === _autoForUnitId;
    }
    return true; // 'round' and 'until_stop' apply to every turn
  }

  // ── RESET (new combat) ─────────────────────────────────────────────
  function reset() {
    _unitControl = {};
    _teamControl = { player: 'manual' };
    _defaultControl = 'manual';  // default is manual-first; AI via auto button
    _diceMode = 'auto';
    _diceQueue = [];
    _dicePromptFn = null;
    _diceHistory = [];
    _autoScope = null;
    _autoStartTurnIndex = null;
    _autoForUnitId = null;
  }

  // ── SNAPSHOT (for persistence / debugging) ────────────────────────
  function snapshot() {
    return {
      unitControl:    { ..._unitControl },
      teamControl:    { ..._teamControl },
      defaultControl: _defaultControl,
      diceMode:       _diceMode,
      queueLength:    _diceQueue.length,
      hasPromptFn:    !!_dicePromptFn,
      autoScope:      _autoScope,
      autoForUnitId:  _autoForUnitId
    };
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    // Control
    setUnitControl, setTeamControl, setDefaultControl,
    getControlMode, isManual, isAI,
    // One-shot auto
    requestAuto, stopAuto, getAutoScope, isAutoActive,
    tickAutoScope, shouldAutoThisTurn,
    // Dice
    setDiceMode, getDiceMode,
    queueDice, popQueuedDice, clearDiceQueue, diceQueueLength,
    setDicePromptFn, getDicePromptFn,
    recordDiceRoll, getDiceHistory,
    // Lifecycle
    reset, snapshot
  });
})();
