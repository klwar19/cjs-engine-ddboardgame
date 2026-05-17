// combat-manager.js
// The turn loop state machine. Owns the live combat state, drives phases,
// and routes control to AI or manual input based on CombatSettings.
//
// Phases per unit turn:
//   turn_start → action → resolution (after each action) → turn_end
//
// Reads: encounter (from data-store), stat-compiler, grid-engine,
//        ai-controller, action-handler, status-manager, effect-resolver,
//        combat-settings, combat-log
// Used by: combat-ui (Phase 5), or directly via runTurnStep() for testing
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.CombatManager = (() => {
  'use strict';

  const DS  = () => window.CJS.DataStore;
  const SC  = () => window.CJS.StatCompiler;
  const GE  = () => window.CJS.GridEngine;
  const AH  = () => window.CJS.ActionHandler;
  const AI  = () => window.CJS.AIController;
  const SM  = () => window.CJS.StatusManager;
  const ER  = () => window.CJS.EffectResolver;
  const CS  = () => window.CJS.CombatSettings;
  const Log = () => window.CJS.CombatLog;
  const F   = () => window.CJS.Formulas;
  const C   = () => window.CJS.CONST;
  const D   = () => window.CJS.DiceService || window.CJS.Dice;
  const AM  = () => window.CJS.AudioManager;
  const AB  = () => window.CJS.AnimationBus;
  const WX  = () => window.CJS.Weather;

  // ── COMBAT STATE ───────────────────────────────────────────────────
  let _state = null;

  // _state shape:
  // {
  //   encounter: original encounter record
  //   units: { instanceId → compiled unit }
  //   initiative: [instanceId, ...]       // order for this round
  //   turnIndex: number                   // index into initiative
  //   roundNumber: number
  //   phase: 'idle'|'turn_start'|'action'|'awaiting_input'|'turn_end'|'battle_end'
  //   currentUnitId: string | null
  //   winner: 'player'|'enemy'|'draw'|null
  //   subscribers: [fn, ...]              // notified on state changes
  // }

  // ── LIFECYCLE ─────────────────────────────────────────────────────
  function startEncounter(encounterId) {
    const enc = typeof encounterId === 'string' ? DS().get('encounters', encounterId) : encounterId;
    if (!enc) throw new Error(`Encounter not found: ${encounterId}`);

    Log().reset();
    Log().setTurn(1);
    Log().setPhase('setup');
    Log().logBattleStart(enc.units);

    // Compile every unit referenced by the encounter
    const unitObjects = {};
    const initiative = [];
    const idCounts = {};  // track duplicates: { 'ice_wolf': 2, ... }

    // Build patched placements with unique instance IDs
    const patchedUnits = [];
    for (const placement of (enc.units || [])) {
      const base = DS().get('characters', placement.id) || DS().get('monsters', placement.id);
      if (!base) {
        console.warn(`Unit ${placement.id} not found in data store`);
        continue;
      }
      // Generate unique instance ID for duplicates
      idCounts[placement.id] = (idCounts[placement.id] || 0) + 1;
      const instanceId = idCounts[placement.id] > 1
        ? `${placement.id}_${idCounts[placement.id]}`
        : placement.id;

      const compiled = SC().compileUnit(base, instanceId, {
        currentHP: placement.currentHP,
        currentMP: placement.currentMP,
        activeStatuses: placement.activeStatuses || []
      });
      if (placement.size) compiled.size = placement.size;
      unitObjects[instanceId] = compiled;
      initiative.push(instanceId);
      // Patched placement for grid-engine (needs unique IDs too)
      patchedUnits.push({ ...placement, id: instanceId });
    }

    // Initialize grid with patched unique-ID placements
    const patchedEnc = { ...enc, units: patchedUnits };
    GE().init(patchedEnc, unitObjects);

    // Roll initiative
    initiative.sort((a, b) => {
      const ua = unitObjects[a], ub = unitObjects[b];
      const ai = F().calcInitiative(ua.compiledStats.A, 0, (D().d20 ? D().d20().total : Math.floor(Math.random()*20)+1));
      const bi = F().calcInitiative(ub.compiledStats.A, 0, (D().d20 ? D().d20().total : Math.floor(Math.random()*20)+1));
      return bi - ai; // higher goes first
    });

    _state = {
      encounter: enc,
      units: unitObjects,
      initiative,
      turnIndex: 0,
      roundNumber: 1,
      phase: 'idle',
      currentUnitId: null,
      winner: null,
      subscribers: [],
      // Global battlefield environment (weather). Defaults to "normal".
      // Weather skills mutate this via Weather.setEnvironment().
      environment: { id: 'normal', remaining: 0, sourceUnitId: null, appliedRound: 1 }
    };
    // Seed default environment via Weather manager so its log/notify hooks fire.
    try { if (WX()) WX().initEnvironment(_state, 1); } catch (e) {}
    // Stamp weather stat mods onto units in case startEncounter is called with
    // a non-normal environment override later. Idempotent.
    try {
      if (WX()) for (const u of Object.values(unitObjects)) WX().applyStatModsToUnit(u, _state);
    } catch (e) {}

    // Fire on_battle_start for every unit
    for (const id of initiative) {
      ER().fireTrigger('on_battle_start', {
        unit: unitObjects[id],
        allUnits: Object.values(unitObjects),
        turnNumber: 1
      });
    }

    _notify();
    return _state;
  }

  // ── TURN STEP ─────────────────────────────────────────────────────
  // Run one step of the turn loop. Returns the new phase.
  // For player/manual turns, step pauses at 'awaiting_input'; call
  // submitAction() then step() again.
  function step() {
    if (!_state || _state.phase === 'battle_end') return _state?.phase;

    switch (_state.phase) {
      case 'idle':
        return _beginCurrentUnitTurn();
      case 'turn_start':
        return _runActionPhase();
      case 'awaiting_input': {
        // If an auto request came in while we were paused, resume action phase.
        const u = getCurrentUnit();
        if (u && CS() && CS().shouldAutoThisTurn(u)) {
          _state.phase = 'action';
          return _runActionPhase();
        }
        return 'awaiting_input';
      }
      case 'action':
        return _runActionPhase();
      case 'turn_end':
        return _endCurrentUnitTurn();
      default:
        return _state.phase;
    }
  }

  // Advance as far as possible without needing user input. Stops at
  // 'awaiting_input' or 'battle_end'. If it hits a rare unchanging state
  // (same phase + same unit + same turn-state across 3 iterations), breaks
  // to avoid infinite loops.
  function runUntilInput(maxSteps) {
    const limit = maxSteps || 500;
    let sig = _stateSignature();
    let stableCount = 0;
    for (let i = 0; i < limit; i++) {
      const next = step();
      if (next === 'awaiting_input' || next === 'battle_end') return next;
      const newSig = _stateSignature();
      if (newSig === sig) {
        stableCount++;
        if (stableCount >= 3) break;  // truly stuck
      } else {
        stableCount = 0;
        sig = newSig;
      }
    }
    return _state.phase;
  }

  function _stateSignature() {
    if (!_state) return '';
    const u = _state.units[_state.currentUnitId];
    const ts = u?.turnState || {};
    return `${_state.phase}|${_state.currentUnitId}|${_state.roundNumber}|${ts.hasMoved?1:0}|${ts.mainActionUsed?1:0}|${ts.apRemaining||0}`;
  }

  function _beginCurrentUnitTurn() {
    const id = _state.initiative[_state.turnIndex];
    const unit = _state.units[id];
    if (!unit || unit.currentHP <= 0) {
      // Skip dead units
      _advanceInitiative();
      return step();
    }

    _state.currentUnitId = id;
    _state.phase = 'turn_start';
    Log().setTurn(_state.roundNumber);
    Log().setPhase('turn_start');
    Log().logTurnStart(unit);

    try { AB()?.emit('turn_start', { unit, round: _state.roundNumber }); } catch (e) {}

    // Check whether a one-shot auto scope has expired (e.g. 'turn' scope
    // clears as soon as we're on a different unit's turn)
    if (CS()) {
      CS().tickAutoScope({
        unitId: id,
        turnIndex: _state.turnIndex,
        rounds: _state.roundNumber - 1
      });
    }

    // Reset turn state
    unit.turnState = unit.turnState || {};
    unit.turnState.hasMoved = false;
    unit.turnState.mainActionUsed = false;
    unit.turnState.apRemaining =
      (unit.baseAP || C().ACTION_ECONOMY.baseAP || 2) +
      (C().ACTION_ECONOMY.turnStartAP || 0) +
      (unit.turnState.bonusAP || 0);
    unit.turnState.bonusAP = 0;
    unit.turnState.isDefending = false;

    // Decrement cooldowns
    const cds = unit.turnState.cooldowns || {};
    for (const k of Object.keys(cds)) {
      if (cds[k] > 0) cds[k] -= 1;
    }

    // Clear defend bonus from last turn
    if (unit._defendDRBoost) delete unit._defendDRBoost;

    // Tick turn-start statuses (burn, regen)
    if (SM()) SM().tickStatuses(unit, 'turn_start');

    // Process any recompile requests from status changes
    if (SM()) {
      SM().processRecompileRequests([unit], (baseId) =>
        DS().get('characters', baseId) || DS().get('monsters', baseId)
      );
    }

    // Fire on_turn_start
    ER().fireTrigger('on_turn_start', {
      unit, allUnits: Object.values(_state.units),
      turnNumber: _state.roundNumber
    });

    // ── Terrain effect at turn start (standing in fire, lava, etc.) ──
    if (GE() && unit.pos) {
      const _terrainType = GE().getTerrain(unit.pos[0], unit.pos[1]);
      if (_terrainType && _terrainType !== 'empty') {
        const _td = C() ? C().TERRAIN_TYPES[_terrainType] : null;
        if (_td && _td.effect) {
          const _tEffect = DS().get('effects', _td.effect);
          if (_tEffect) {
            ER().executeEffect(_tEffect, {
              caster: null, unit, target: unit,
              allUnits: Object.values(_state.units),
              turnNumber: _state.roundNumber
            });
            Log().record({
              type: 'terrain_effect', actor: null, target: unit,
              tags: ['terrain', _terrainType],
              data: { terrain: _terrainType, effectId: _td.effect }
            });
          }
        }
      }
    }

    // Check HP threshold trigger
    if (unit.currentHP / unit.maxHP < 0.3) {
      ER().fireTrigger('on_low_hp', {
        unit, allUnits: Object.values(_state.units),
        turnNumber: _state.roundNumber
      });
    }

    // Check death during tick
    if (unit.currentHP <= 0) {
      _handleDeath(unit);
      _advanceInitiative();
      _notify();
      return step();
    }

    // Check battle end
    if (_checkBattleEnd()) { _notify(); return 'battle_end'; }

    _state.phase = 'action';
    Log().setPhase('action');
    _notify();
    return 'action';
  }

  function _runActionPhase() {
    const unit = _state.units[_state.currentUnitId];
    if (!unit) return _advanceInitiative();

    // If stunned/can't act — skip to end turn
    if (SM() && !SM().canAct(unit)) {
      Log().logNote(`${unit.name} is unable to act`, ['skipped', 'disabled']);
      _state.phase = 'turn_end';
      _notify();
      return 'turn_end';
    }

    const baseMode = CS() ? CS().getControlMode(unit) : 'ai';
    const autoThisTurn = CS() ? CS().shouldAutoThisTurn(unit) : false;
    const mode = autoThisTurn ? 'ai' : baseMode;

    if (mode === 'manual') {
      // Hand off to UI
      _state.phase = 'awaiting_input';
      _notify();
      return 'awaiting_input';
    }

    // AI
    const decision = AI().decide(unit);
    if (!decision || decision.type === 'end_turn') {
      _state.phase = 'turn_end';
      _notify();
      return 'turn_end';
    }

    // For AI-chosen skill actions, simulate the QTE since the AI can't play
    // the minigame. Basic attacks don't use QTE.
    if (decision.type === 'skill' && decision.skillId) {
      const SR = window.CJS.SkillResolver;
      const skill = SR ? SR.resolveUnitSkill(unit, decision.skillId) : DS().get('skills', decision.skillId);
      if (skill && skill.qte && skill.qte !== 'none') {
        decision.qteResult = AH().simulateAIQTE(unit, skill);
      }
    }

    const result = AH().execute(unit, decision, { turnNumber: _state.roundNumber });
    if (!result.success) {
      // AI picked an invalid action (edge case — pathing or range check failed).
      // Don't loop forever: end its turn.
      Log().logNote(`AI action invalid (${result.reason}); ending turn`, ['ai_fallback']);
      _state.phase = 'turn_end';
      _notify();
      return 'turn_end';
    }
    _afterActionHook(unit, decision, result);
    _notify();

    return _state.phase;
  }

  // ── MANUAL INPUT ENTRY POINT ──────────────────────────────────────
  // UI calls this when the player (or manual-controlled monster) picks
  // an action. Returns the action result.
  function submitAction(action) {
    if (!_state) return { success: false, reason: 'no_combat' };
    if (_state.phase !== 'awaiting_input' && _state.phase !== 'action') {
      return { success: false, reason: 'not_awaiting_input' };
    }
    const unit = _state.units[_state.currentUnitId];
    if (!unit) return { success: false, reason: 'no_unit' };

    // Player/manual actor submitted
    const result = AH().execute(unit, action, { turnNumber: _state.roundNumber });
    if (result.success) {
      _afterActionHook(unit, action, result);
    }
    _notify();
    return result;
  }

  // ── POST-ACTION HOOK ──────────────────────────────────────────────
  function _afterActionHook(unit, action, result) {
    // Process any recompile requests IMMEDIATELY after each action.
    // Without this, passive-stat-bearing statuses applied mid-turn
    // (e.g. on_hit buff, on_take_damage debuff) would not change
    // derived stats until the next turn_start — a full turn late.
    if (SM()) {
      const allUnits = Object.values(_state.units);
      SM().processRecompileRequests(allUnits, (baseId) =>
        DS().get('characters', baseId) || DS().get('monsters', baseId)
      );
    }

    // Check deaths on the board
    for (const u of Object.values(_state.units)) {
      if (u.currentHP <= 0 && !u._deathProcessed) {
        _handleDeath(u);
      }
    }

    if (_checkBattleEnd()) {
      _state.phase = 'battle_end';
      Log().setPhase('battle_end');
      return;
    }

    // If end_turn or main action used and has moved (or can't move), end turn
    const ts = unit.turnState;
    const canDoMore = (!ts.mainActionUsed || !ts.hasMoved) && (ts.apRemaining || 0) > 0;

    if (action.type === 'end_turn' || !canDoMore) {
      _state.phase = 'turn_end';
    } else {
      // Return to action phase for another sub-action
      _state.phase = 'action';
    }
  }

  function _endCurrentUnitTurn() {
    const unit = _state.units[_state.currentUnitId];
    if (!unit) return _advanceInitiative();

    Log().setPhase('turn_end');

    // Tick turn-end statuses
    if (SM()) SM().tickStatuses(unit, 'turn_end');

    // Fire on_turn_end
    ER().fireTrigger('on_turn_end', {
      unit, allUnits: Object.values(_state.units),
      turnNumber: _state.roundNumber
    });

    // Tick global weather once per round (when the last initiative slot ends).
    // This applies periodic weather damage/heals and decrements duration.
    const lastInRound = _state.turnIndex === (_state.initiative.length - 1);
    if (lastInRound && WX()) {
      const prevId = _state.environment?.id;
      WX().tickEnvironment(_state);
      if (prevId !== _state.environment?.id) {
        // Weather changed: restamp stat mods on all units
        for (const u of Object.values(_state.units)) WX().applyStatModsToUnit(u, _state);
      }
    }

    // Death check after turn-end ticks (also catches weather-tick kills)
    for (const u of Object.values(_state.units)) {
      if ((u.currentHP || 0) <= 0 && !u._deathProcessed) _handleDeath(u);
    }

    Log().logTurnEnd(unit);

    if (_checkBattleEnd()) { _notify(); return 'battle_end'; }

    _advanceInitiative();
    _notify();
    return _state.phase;
  }

  function _advanceInitiative() {
    _state.turnIndex += 1;
    if (_state.turnIndex >= _state.initiative.length) {
      _state.turnIndex = 0;
      _state.roundNumber += 1;
    }
    _state.phase = 'idle';
    _state.currentUnitId = null;
  }

  // ── DEATH ──────────────────────────────────────────────────────────
  function _handleDeath(unit) {
    if (unit._deathProcessed) return;
    unit._deathProcessed = true;
    try { AB()?.emit('unit_ko', { unit }); } catch (e) {}
    try { AM()?.playSfx('ko'); } catch (e) {}
    ER().fireTrigger('on_death', {
      unit, allUnits: Object.values(_state.units),
      turnNumber: _state.roundNumber
    });
    // If still 0 HP after on_death (no revive), remove from board
    if (unit.currentHP <= 0) {
      GE().removeFromBoard(unit.instanceId);
    }
  }

  // ── BATTLE END CHECK ───────────────────────────────────────────────
  function _checkBattleEnd() {
    if (!_state) return false;
    const all = Object.values(_state.units);
    const playersAlive = all.some(u => u.team === 'player' && u.currentHP > 0);
    const enemiesAlive = all.some(u => u.team === 'enemy'  && u.currentHP > 0);

    if (!playersAlive && !enemiesAlive) {
      _endBattle('draw', 'mutual_kill');
      return true;
    }
    if (!playersAlive) { _endBattle('enemy',  'all_players_defeated'); return true; }
    if (!enemiesAlive) { _endBattle('player', 'all_enemies_defeated'); return true; }
    return false;
  }

  function _endBattle(winner, reason) {
    _state.winner = winner;
    _state.phase = 'battle_end';
    Log().logBattleEnd({ winner, reason });
    // Fire on_battle_end for all survivors
    for (const u of Object.values(_state.units)) {
      if ((u.currentHP || 0) > 0) {
        ER().fireTrigger('on_battle_end', {
          unit: u, allUnits: Object.values(_state.units),
          turnNumber: _state.roundNumber
        });
      }
    }
  }

  // ── CURRENT UNIT QUERIES (for UI) ──────────────────────────────────
  function getCurrentUnit() {
    return _state ? _state.units[_state.currentUnitId] : null;
  }

  function getAvailableActionsForCurrent() {
    const u = getCurrentUnit();
    return u ? AH().getAvailableActions(u) : null;
  }

  function isAwaitingInput() {
    return _state?.phase === 'awaiting_input';
  }

  function isManualTurn() {
    const u = getCurrentUnit();
    if (!u || !CS()) return false;
    // If a one-shot auto is active and applies to this unit, NOT a manual turn.
    if (CS().shouldAutoThisTurn(u)) return false;
    return CS().getControlMode(u) === 'manual';
  }

  // ── ONE-SHOT AUTO (UI convenience) ────────────────────────────────
  // "Auto this turn" — resolve the current unit's remaining actions via AI.
  // autoOneTurn() → CombatSettings.requestAuto('turn', ...); run until the
  // turn ends, stopping at battle_end or awaiting_input (shouldn't happen
  // during auto, but defensive).
  // Returns the final phase.
  function autoOneTurn() {
    const u = getCurrentUnit();
    if (!u) return _state?.phase || 'idle';
    CS().requestAuto('turn', { unitId: u.instanceId });
    // Drive the loop until the turn ends or battle ends
    return runUntilInput();
  }

  function autoOneRound() {
    if (!_state) return 'idle';
    CS().requestAuto('round', { turnIndex: _state.turnIndex });
    return runUntilInput();
  }

  function autoUntilStop() {
    CS().requestAuto('until_stop');
    return runUntilInput();
  }

  function stopAuto() {
    if (CS()) CS().stopAuto();
  }

  function getState() { return _state; }

  function getUnits() {
    return _state ? Object.values(_state.units) : [];
  }

  function getInitiativeOrder() {
    return _state ? _state.initiative.map(id => _state.units[id]) : [];
  }

  // ── SUBSCRIPTIONS (UI bindings) ────────────────────────────────────
  function subscribe(fn) {
    if (!_state) return () => {};
    _state.subscribers.push(fn);
    return () => {
      const i = _state.subscribers.indexOf(fn);
      if (i >= 0) _state.subscribers.splice(i, 1);
    };
  }

  function _notify() {
    if (!_state) return;
    for (const cb of _state.subscribers) {
      try { cb(_state); } catch (e) { console.error('CombatManager subscriber error:', e); }
    }
  }

  // ── RESET ──────────────────────────────────────────────────────────
  function reset() {
    _state = null;
    if (CS()) CS().reset();
  }

  // ── GM CONTROLS (live battlefield manipulation) ───────────────────
  // These let a Game Master mutate the live combat state mid-battle.
  // All operations go through the same notify/log pipeline as normal
  // actions so the UI and log stay coherent.

  function gmAddUnit(baseId, r, c, opts = {}) {
    if (!_state) return { success: false, reason: 'no_combat' };
    const base = DS().get('monsters', baseId) || DS().get('characters', baseId);
    if (!base) return { success: false, reason: 'unit_not_found' };

    // Unique instance ID — count existing instances of this base
    let n = 1;
    while (_state.units[n === 1 ? baseId : `${baseId}_${n}`]) n++;
    const instanceId = n === 1 ? baseId : `${baseId}_${n}`;

    const overrides = { ...base, team: opts.team || base.team || 'enemy' };
    const compiled = SC().compileUnit(overrides, instanceId, {});
    if (!compiled) return { success: false, reason: 'compile_failed' };

    const size = opts.size || base.size || '1x1';
    compiled.size = size;
    compiled.instanceId = instanceId;

    if (!GE().addUnit(compiled, r, c, size)) {
      return { success: false, reason: 'cell_blocked' };
    }

    _state.units[instanceId] = compiled;
    // Insert into initiative just AFTER the current turn so they act next.
    const insertAt = Math.min(_state.turnIndex + 1, _state.initiative.length);
    _state.initiative.splice(insertAt, 0, instanceId);

    Log().logNote(`GM: added ${compiled.name || instanceId} at [${r},${c}] (${compiled.team})`, ['gm', 'gm_add']);
    try { ER().fireTrigger('on_battle_start', { unit: compiled, allUnits: Object.values(_state.units), turnNumber: _state.roundNumber }); } catch (e) {}
    _notify();
    return { success: true, unit: compiled };
  }

  function gmRemoveUnit(instanceId) {
    if (!_state) return { success: false, reason: 'no_combat' };
    const unit = _state.units[instanceId];
    if (!unit) return { success: false, reason: 'unit_not_found' };

    GE().removeFromBoard(instanceId);
    const idx = _state.initiative.indexOf(instanceId);
    if (idx >= 0) {
      _state.initiative.splice(idx, 1);
      if (idx < _state.turnIndex) _state.turnIndex--;
    }
    delete _state.units[instanceId];

    Log().logNote(`GM: removed ${unit.name || instanceId}`, ['gm', 'gm_remove']);
    if (_checkBattleEnd()) { _notify(); return { success: true, ended: true }; }
    _notify();
    return { success: true };
  }

  function gmMoveUnit(instanceId, r, c) {
    if (!_state) return { success: false, reason: 'no_combat' };
    const unit = _state.units[instanceId];
    if (!unit) return { success: false, reason: 'unit_not_found' };
    const result = GE().teleportUnit(instanceId, r, c);
    if (!result.success) return result;
    Log().logNote(`GM: moved ${unit.name || instanceId} to [${r},${c}]`, ['gm', 'gm_move']);
    try { AB()?.emit('unit_move', { unit, from: unit.pos, to: [r, c] }); } catch (e) {}
    _notify();
    return { success: true };
  }

  // mode: 'set' | 'delta' | 'full' | 'pct' (pct = % of max)
  function gmAdjustResource(unit, resource, amount, mode = 'set') {
    if (!unit) return { success: false, reason: 'unit_not_found' };

    if (resource === 'AP') {
      const ts = unit.turnState = unit.turnState || { apRemaining: 0 };
      const cur = Number(ts.apRemaining || 0);
      if (mode === 'delta') ts.apRemaining = Math.max(0, cur + Number(amount || 0));
      else if (mode === 'full') ts.apRemaining = (unit.baseAP || 2) + (unit.turnState?.bonusAP || 0);
      else ts.apRemaining = Math.max(0, Number(amount || 0));
      Log().logNote(`GM: ${unit.name || unit.instanceId} AP → ${ts.apRemaining}`, ['gm', 'gm_ap']);
      _notify();
      return { success: true, value: ts.apRemaining };
    }

    const maxKey = resource === 'HP' ? 'maxHP' : 'maxMP';
    const curKey = resource === 'HP' ? 'currentHP' : 'currentMP';
    const max = Number(unit[maxKey] || 0);
    const cur = Number(unit[curKey] || 0);
    let next = cur;

    if (mode === 'full') next = max;
    else if (mode === 'delta') next = cur + Number(amount || 0);
    else if (mode === 'pct') next = Math.round(max * (Number(amount || 0) / 100));
    else next = Number(amount || 0);

    next = Math.max(0, Math.min(max, next));
    unit[curKey] = next;

    if (resource === 'HP') {
      if (cur > 0 && next === 0) {
        unit._deathProcessed = false;
        _handleDeath(unit);
      } else if (cur === 0 && next > 0) {
        // Revive: clear death flag, re-place on grid if needed
        unit._deathProcessed = false;
        unit.removed = false;
      }
    }
    Log().logNote(`GM: ${unit.name || unit.instanceId} ${resource} → ${next}/${max}`, ['gm', `gm_${resource.toLowerCase()}`]);
    if (_checkBattleEnd()) { _notify(); return { success: true, value: next, ended: true }; }
    _notify();
    return { success: true, value: next };
  }

  function gmApplyStatus(unit, statusId, duration) {
    if (!unit || !statusId) return { success: false, reason: 'bad_args' };
    if (!SM()) return { success: false, reason: 'no_status_manager' };
    const res = SM().applyStatus({
      target: unit,
      statusId,
      sourceUnit: null,
      overrides: { duration: Number(duration) || 3, stacks: 1 },
      combatContext: { turnNumber: _state?.roundNumber || 1 }
    });
    Log().logNote(`GM: applied ${statusId} to ${unit.name || unit.instanceId}`, ['gm', 'gm_status']);
    SM().processRecompileRequests(Object.values(_state.units), (baseId) =>
      DS().get('characters', baseId) || DS().get('monsters', baseId));
    _notify();
    return { success: true, ...res };
  }

  function gmCleanseUnit(unit) {
    if (!unit || !SM()) return { success: false };
    const n = SM().cleanse({ unit });
    Log().logNote(`GM: cleansed ${n} status(es) from ${unit.name || unit.instanceId}`, ['gm', 'gm_cleanse']);
    SM().processRecompileRequests(Object.values(_state.units), (baseId) =>
      DS().get('characters', baseId) || DS().get('monsters', baseId));
    _notify();
    return { success: true, removed: n };
  }

  function gmSetTerrain(r, c, terrainType) {
    if (!GE().setTerrain(r, c, terrainType)) {
      return { success: false, reason: 'invalid_cell_or_terrain' };
    }
    Log().logNote(`GM: terrain at [${r},${c}] → ${terrainType}`, ['gm', 'gm_terrain']);
    _notify();
    return { success: true };
  }

  // scope: 'all' | 'player' | 'enemy'
  function _scopedUnits(scope) {
    const all = Object.values(_state?.units || {});
    if (scope === 'player') return all.filter(u => u.team === 'player');
    if (scope === 'enemy')  return all.filter(u => u.team === 'enemy');
    return all;
  }

  function gmBulkAdjust(scope, resource, amount, mode) {
    if (!_state) return { success: false, reason: 'no_combat' };
    const units = _scopedUnits(scope);
    for (const u of units) gmAdjustResource(u, resource, amount, mode);
    return { success: true, count: units.length };
  }

  function gmBulkStatus(scope, statusId, duration) {
    if (!_state) return { success: false, reason: 'no_combat' };
    const units = _scopedUnits(scope).filter(u => u.currentHP > 0);
    for (const u of units) gmApplyStatus(u, statusId, duration);
    return { success: true, count: units.length };
  }

  function gmBulkCleanse(scope) {
    if (!_state) return { success: false, reason: 'no_combat' };
    const units = _scopedUnits(scope);
    let total = 0;
    for (const u of units) total += (gmCleanseUnit(u).removed || 0);
    return { success: true, removed: total };
  }

  // mode: 'empty' (only empty/passable cells, leave units/walls alone) | 'all'
  function gmBulkTerrain(terrainType, mode = 'empty') {
    if (!_state) return { success: false, reason: 'no_combat' };
    const dims = GE().getDims();
    let n = 0;
    if (mode === 'empty') {
      for (const [r, c] of GE().getEmptyCells()) {
        if (GE().setTerrain(r, c, terrainType)) n++;
      }
    } else {
      for (let r = 0; r < dims.height; r++) {
        for (let c = 0; c < dims.width; c++) {
          if (GE().setTerrain(r, c, terrainType)) n++;
        }
      }
    }
    Log().logNote(`GM: bulk terrain ${terrainType} → ${n} cells (${mode})`, ['gm', 'gm_terrain_bulk']);
    _notify();
    return { success: true, count: n };
  }

  function gmEndBattle(winner) {
    if (!_state) return { success: false, reason: 'no_combat' };
    _endBattle(winner || 'player', 'gm_forced');
    _notify();
    return { success: true };
  }

  function gmSkipTurn() {
    if (!_state) return { success: false, reason: 'no_combat' };
    Log().logNote(`GM: skipped ${getCurrentUnit()?.name || 'turn'}`, ['gm', 'gm_skip']);
    _state.phase = 'turn_end';
    _notify();
    return { success: true };
  }

  function getEnvironment() {
    return _state?.environment || { id: 'normal', remaining: 0 };
  }

  function notify() { _notify(); }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  // Not frozen: lets tests stub specific functions (e.g. getEnvironment)
  // to exercise damage-calc weather paths without standing up a full battle.
  return {
    startEncounter, step, runUntilInput, submitAction,
    getCurrentUnit, getAvailableActionsForCurrent,
    isAwaitingInput, isManualTurn,
    // One-shot auto control (manual-first UX)
    autoOneTurn, autoOneRound, autoUntilStop, stopAuto,
    getState, getUnits, getInitiativeOrder,
    subscribe, reset,
    // Environment / weather
    getEnvironment,
    notify,
    // GM controls
    gmAddUnit, gmRemoveUnit, gmMoveUnit,
    gmAdjustResource, gmApplyStatus, gmCleanseUnit, gmSetTerrain,
    gmBulkAdjust, gmBulkStatus, gmBulkCleanse, gmBulkTerrain,
    gmEndBattle, gmSkipTurn
  };
})();
