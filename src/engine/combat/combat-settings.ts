// combat-settings.ts — Tier 3 TS port of js/combat/combat-settings.js (engine
// cluster: combat). Central runtime settings: who controls which unit (AI vs
// manual), how dice resolve (auto/queued/prompt), one-shot auto scopes, and
// UI-only presentation knobs. Other modules read here; the UI writes via toggles.
//
// Reads: nothing. Used by: combat-manager, dice-service, action-handler.
//
// Exports the typed `CombatSettings: CJSCombatSettings` AND installs
// window.CJS.CombatSettings. Module-level `let` state; bodies verbatim.

// ── CONTROL MODE ───────────────────────────────────────────────────
let _unitControl: Record<string, any> = {};                    // { unitId: 'ai' | 'manual' }
let _teamControl: Record<string, any> = { player: 'manual' };  // { teamName: 'ai' | 'manual' }
let _defaultControl: CJSControlMode = 'manual';                 // Manual-first: click Auto to delegate

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
let _diceMode: CJSDiceMode = 'auto';
let _diceQueue: any[] = [];
let _dicePromptFn: any = null;
let _diceHistory: any[] = [];   // audit log of recent rolls: { expr, result, source }

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

// ── PRESENTATION (audio + animations) ─────────────────────────────
// These are UI-only knobs. Combat math never reads them.

let _animationsEnabled = true;
let _defaultBgmPool: any[] = [];

function setAnimationsEnabled(flag) { _animationsEnabled = !!flag; }
function getAnimationsEnabled() { return _animationsEnabled; }

function setDefaultBgmPool(ids) {
  _defaultBgmPool = Array.isArray(ids) ? ids.filter(Boolean).map(String) : [];
}
function getDefaultBgmPool() { return _defaultBgmPool.slice(); }

// ── ONE-SHOT AUTO ──────────────────────────────────────────────────
// Transient "let AI resolve this" request, separate from base control mode.
// Scopes: 'turn' (clears at turn_end), 'round' (until we loop back to the
// initial turnIndex), 'until_stop' (until stopAuto()). Combat-manager consumes
// it via shouldAutoThisTurn(unit, turnIndex).

let _autoScope: any = null;           // 'turn' | 'round' | 'until_stop' | null
let _autoStartTurnIndex: any = null;  // set when 'round' scope begins
let _autoForUnitId: any = null;       // set when 'turn' scope begins

function requestAuto(scope, ctx?) {
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
  // Note: _animationsEnabled and _defaultBgmPool are session-level presentation
  // prefs, not per-battle state. Don't reset them here.
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
export const CombatSettings: CJSCombatSettings = Object.freeze({
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
  // Presentation
  setAnimationsEnabled, getAnimationsEnabled,
  setDefaultBgmPool, getDefaultBgmPool,
  // Lifecycle
  reset, snapshot
});

// Runtime compatibility install — keep window.CJS.CombatSettings identical to the
// legacy IIFE so every existing consumer (and the vanilla engine) is unchanged.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.CombatSettings = CombatSettings;
