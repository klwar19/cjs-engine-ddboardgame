// combat-ui.js
// Combat screen UI controller. Binds CombatManager, GridRenderer,
// NarratorEngine, and QTE modules into a cohesive combat experience.
//
// Responsibilities:
//   - Render initiative tracker, action buttons, HP/MP bars
//   - Handle player targeting mode (click grid cell → submit action)
//   - Display battle log with narrator commentary
//   - Manage QTE modal overlays
//   - Show loot screen on battle end
//
// Reads: CombatManager, GridEngine, GridRenderer, ActionHandler,
//        NarratorEngine, QteManager, CombatSettings, CombatLog
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.CombatUI = (() => {
  'use strict';

  const CM   = () => window.CJS.CombatManager;
  const GE   = () => window.CJS.GridEngine;
  const GR   = () => window.CJS.GridRenderer;
  const AH   = () => window.CJS.ActionHandler;
  const NE   = () => window.CJS.NarratorEngine;
  const ND   = () => window.CJS.NarratorData;
  const DS   = () => window.CJS.DataStore;
  const QM   = () => window.CJS.QteManager;
  const CS   = () => window.CJS.CombatSettings;
  const Log  = () => window.CJS.CombatLog;
  const C    = () => window.CJS.CONST;

  // ── STATE ──────────────────────────────────────────────────────────
  let _container = null;
  let _mode = 'idle';       // 'idle'|'move'|'target_single'|'target_aoe'|'qte'
  let _pendingAction = null; // action being constructed
  let _unsubCM = null;
  let _unsubLog = null;
  let _unsubNarrator = null;
  let _qteResolve = null;   // resolve function for QTE promise

  // DOM references
  let $grid, $log, $actions, $initiative, $unitInfo, $narrator, $qteOverlay;
  let $diceModal, $diceControls;

  // ── INIT ──────────────────────────────────────────────────────────
  function init(containerEl) {
    _container = containerEl;
    _buildLayout();
    _bindEvents();
  }

  function _buildLayout() {
    _container.innerHTML = `
      <div class="combat-screen">
        <div class="combat-top">
          <div id="cbt-initiative" class="initiative-bar"></div>
        </div>
        <div class="combat-middle">
          <div class="combat-grid-wrap">
            <canvas id="cbt-canvas"></canvas>
          </div>
          <div class="combat-sidebar">
            <div id="cbt-unit-info" class="unit-info-panel"></div>
            <div id="cbt-actions" class="action-panel"></div>
            <div class="dice-controls" id="cbt-dice-controls">
              <div class="dice-mode-row">
                <span class="dice-label">🎲 Dice:</span>
                <button id="btn-dice-auto" class="btn btn-sm dice-mode-btn active">Auto</button>
                <button id="btn-dice-manual" class="btn btn-sm dice-mode-btn">Manual</button>
              </div>
              <div id="dice-queue-row" class="dice-queue-row" style="display:none">
                <input type="text" id="dice-queue-input" placeholder="Pre-queue: 14,7,3,18" class="dice-queue-field">
                <button id="btn-dice-queue" class="btn btn-sm">Queue</button>
              </div>
            </div>
            <div class="auto-controls">
              <button id="btn-auto-turn" class="btn btn-sm">Auto Turn</button>
              <button id="btn-auto-round" class="btn btn-sm">Auto Round</button>
              <button id="btn-auto-all" class="btn btn-sm">Auto All</button>
              <button id="btn-stop-auto" class="btn btn-sm btn-danger" style="display:none">Stop</button>
            </div>
          </div>
        </div>
        <div class="combat-bottom">
          <div id="cbt-narrator" class="narrator-panel"></div>
          <div id="cbt-log" class="battle-log-panel"></div>
        </div>
        <div id="cbt-qte-overlay" class="qte-overlay" style="display:none"></div>
        <div id="cbt-dice-modal" class="dice-modal-overlay" style="display:none">
          <div class="dice-modal">
            <div class="dice-modal-title" id="dice-modal-title">🎲 Roll: 2d6+3</div>
            <div class="dice-modal-source" id="dice-modal-source">for: Ember Slash</div>
            <div class="dice-modal-range" id="dice-modal-range">Range: 5 — 15</div>
            <input type="number" id="dice-modal-input" class="dice-modal-field" placeholder="Enter value...">
            <div class="dice-modal-buttons">
              <button id="dice-modal-random" class="btn btn-sm">🎲 Random</button>
              <button id="dice-modal-confirm" class="btn btn-primary btn-sm">✅ Confirm</button>
            </div>
            <div class="dice-modal-error" id="dice-modal-error"></div>
          </div>
        </div>
      </div>
    `;

    $grid      = _container.querySelector('.combat-grid-wrap');
    $log       = _container.querySelector('#cbt-log');
    $actions   = _container.querySelector('#cbt-actions');
    $initiative= _container.querySelector('#cbt-initiative');
    $unitInfo  = _container.querySelector('#cbt-unit-info');
    $narrator  = _container.querySelector('#cbt-narrator');
    $qteOverlay= _container.querySelector('#cbt-qte-overlay');
    $diceModal = _container.querySelector('#cbt-dice-modal');
    $diceControls = _container.querySelector('#cbt-dice-controls');

    // Init grid renderer
    const canvas = _container.querySelector('#cbt-canvas');
    GR().init(canvas, {
      cellSize: 64,
      onCellClick: _onCellClick,
      onCellHover: _onCellHover
    });
  }

  function _bindEvents() {
    // ── DICE MODE CONTROLS ────────────────────────────────────────────
    _container.querySelector('#btn-dice-auto')?.addEventListener('click', () => {
      _setDiceMode('auto');
    });
    _container.querySelector('#btn-dice-manual')?.addEventListener('click', () => {
      _setDiceMode('prompt');
    });
    _container.querySelector('#btn-dice-queue')?.addEventListener('click', () => {
      const inp = _container.querySelector('#dice-queue-input');
      const vals = (inp?.value || '').split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && n > 0);
      if (vals.length > 0 && CS()) {
        CS().queueDice(vals);
        inp.value = '';
        _addLogMessage(`🎲 Queued ${vals.length} dice: [${vals.join(', ')}]`, 'note');
      }
    });

    // Register the dice prompt function with CombatSettings.
    // damage-calc uses sync DiceService.roll(), so this function must return
    // a number (not a Promise) for the sync path. We use window.prompt() which
    // is blocking. The fancy modal is available for DiceService.rollAsync() callers.
    if (CS()) {
      CS().setDicePromptFn((expression, source) => {
        const Dice = window.CJS.Dice;
        const parsed = Dice.parse(expression);
        const minVal = Dice.min(parsed);
        const maxVal = Dice.max(parsed);

        const input = window.prompt(
          `🎲 Roll: ${expression}  (for: ${source || 'roll'})\n`
          + `Range: ${minVal} – ${maxVal}\n\n`
          + `Enter a value, or leave blank for random:`
        );

        if (input === null || input.trim() === '') return null; // cancel → auto roll
        const val = parseInt(input, 10);
        if (isNaN(val) || val < minVal || val > maxVal) return null; // invalid → auto
        return val;
      });
    }

    // Auto-control buttons
    _container.querySelector('#btn-auto-turn')?.addEventListener('click', () => {
      CM().autoOneTurn();
      _refresh();
    });
    _container.querySelector('#btn-auto-round')?.addEventListener('click', () => {
      CM().autoOneRound();
      _refresh();
    });
    _container.querySelector('#btn-auto-all')?.addEventListener('click', () => {
      _container.querySelector('#btn-stop-auto').style.display = '';
      CM().autoUntilStop();
      _refresh();
    });
    _container.querySelector('#btn-stop-auto')?.addEventListener('click', () => {
      CM().stopAuto();
      _container.querySelector('#btn-stop-auto').style.display = 'none';
      _refresh();
    });
  }

  // ── START COMBAT ──────────────────────────────────────────────────
  function startCombat(encounterId) {
    // Init narrator
    try {
      if (ND().isLoaded()) {
        NE().init();
        _unsubNarrator = NE().subscribe(_onNarration);
      }
    } catch (e) { console.warn('Narrator init failed (non-fatal):', e.message); }

    // Subscribe BEFORE starting so we don't miss the first events
    _unsubLog = Log().subscribe(_onLogEntry);

    // Start the encounter
    CM().startEncounter(encounterId);
    GR().resize();

    // Subscribe to state changes
    _unsubCM = CM().subscribe(_onStateChange);

    // Kick off the first step
    const phase = CM().runUntilInput();
    console.log('Combat started, phase:', phase);
    _refresh();
  }

  // ── STATE CHANGE HANDLER ──────────────────────────────────────────
  function _onStateChange(state) {
    _refresh();
  }

  function _refresh() {
    const state = CM().getState();
    if (!state) return;

    _renderInitiative(state);
    _renderUnitInfo(state);
    _renderActions(state);
    _updateAutoButtons(state);

    // Grid selection
    const unit = CM().getCurrentUnit();
    GR().setSelectedUnit(unit?.instanceId || null);

    // Battle end
    if (state.phase === 'battle_end') {
      _showBattleEnd(state);
    }
  }

  // ── INITIATIVE BAR ────────────────────────────────────────────────
  function _renderInitiative(state) {
    const order = CM().getInitiativeOrder();
    let html = '';
    for (let i = 0; i < order.length; i++) {
      const u = order[i];
      if (!u) continue;
      const active = u.instanceId === state.currentUnitId;
      const dead = u.currentHP <= 0;
      const teamClass = u.team === 'player' ? 'init-player' : 'init-enemy';
      const cls = `init-unit ${teamClass}${active ? ' init-active' : ''}${dead ? ' init-dead' : ''}`;
      const hpPct = Math.round((u.currentHP / (u.maxHP || 1)) * 100);
      html += `<div class="${cls}" title="${u.name || u.baseId} (${u.currentHP}/${u.maxHP} HP)">
        <span class="init-icon">${u.icon || '?'}</span>
        <span class="init-name">${(u.name || u.baseId || '?').substring(0, 6)}</span>
        <div class="init-hp-bar"><div class="init-hp-fill" style="width:${hpPct}%"></div></div>
      </div>`;
    }
    $initiative.innerHTML = html;
  }

  // ── CURRENT UNIT INFO ─────────────────────────────────────────────
  function _renderUnitInfo(state) {
    const unit = CM().getCurrentUnit();
    if (!unit) { $unitInfo.innerHTML = '<div class="unit-info-empty">Waiting...</div>'; return; }

    const ts = unit.turnState || {};
    const hpPct = Math.round((unit.currentHP / (unit.maxHP || 1)) * 100);
    const mpPct = unit.maxMP ? Math.round(((unit.currentMP || 0) / unit.maxMP) * 100) : 0;

    let statusHtml = '';
    if (unit.activeStatuses?.length > 0) {
      statusHtml = '<div class="unit-statuses">' +
        unit.activeStatuses.map(s =>
          `<span class="status-chip" title="${s.statusId} (${s.duration}t, ${s.stacks}stk)">${_statusIcon(s.statusId)} ${s.duration}t</span>`
        ).join('') + '</div>';
    }

    $unitInfo.innerHTML = `
      <div class="unit-card ${unit.team}">
        <div class="unit-header">
          <span class="unit-icon-lg">${unit.icon || '?'}</span>
          <div>
            <div class="unit-name">${unit.name || unit.baseId}</div>
            <div class="unit-rank">Rank ${unit.rank || '?'} ${unit.type || ''}</div>
          </div>
        </div>
        <div class="resource-bars">
          <div class="bar-row">
            <span class="bar-label">HP</span>
            <div class="bar-track hp"><div class="bar-fill" style="width:${hpPct}%"></div></div>
            <span class="bar-num">${unit.currentHP}/${unit.maxHP}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">MP</span>
            <div class="bar-track mp"><div class="bar-fill" style="width:${mpPct}%"></div></div>
            <span class="bar-num">${unit.currentMP || 0}/${unit.maxMP || 0}</span>
          </div>
        </div>
        <div class="turn-state">
          <span class="${ts.hasMoved ? 'used' : 'available'}">Move: ${ts.hasMoved ? '✗' : '✓'}</span>
          <span class="${ts.mainActionUsed ? 'used' : 'available'}">Action: ${ts.mainActionUsed ? '✗' : '✓'}</span>
          <span>AP: ${ts.apRemaining || 0}</span>
        </div>
        ${statusHtml}
      </div>
    `;
  }

  // ── ACTION PANEL ──────────────────────────────────────────────────
  function _renderActions(state) {
    if (state.phase === 'battle_end') {
      $actions.innerHTML = '';
      return;
    }

    if (!CM().isAwaitingInput() && state.phase !== 'action') {
      $actions.innerHTML = '<div class="action-wait">Processing...</div>';
      return;
    }

    const unit = CM().getCurrentUnit();
    if (!unit) { $actions.innerHTML = ''; return; }

    if (!CM().isManualTurn()) {
      $actions.innerHTML = '<div class="action-wait">AI is thinking...</div>';
      return;
    }

    const avail = CM().getAvailableActionsForCurrent();
    if (!avail) { $actions.innerHTML = ''; return; }

    let html = '<div class="action-buttons">';

    // Move button
    if (avail.move) {
      html += `<button class="btn btn-action btn-move" data-action="move">
        🦶 Move</button>`;
    }

    // Basic Attack
    if (avail.attack) {
      html += `<button class="btn btn-action btn-attack" data-action="attack">
        ⚔️ Attack</button>`;
    }

    // Defend
    if (avail.defend) {
      html += `<button class="btn btn-action btn-defend" data-action="defend">
        🛡️ Defend</button>`;
    }

    // Skills
    if (avail.skills?.length > 0) {
      html += '<div class="skill-list">';
      for (const sk of avail.skills) {
        const name = sk.skill?.name || sk.id;
        const icon = sk.skill?.icon || '✦';
        const disabled = !sk.usable ? 'disabled' : '';
        const reason = sk.cooldown > 0 ? `title="Cooldown: ${sk.cooldown} turns"` : '';
        html += `<button class="btn btn-action btn-skill" data-action="skill"
          data-skill="${sk.id}" ${disabled} ${reason}>
          ${icon} ${name} <span class="skill-cost">${sk.apCost || 0}AP ${sk.mpCost || 0}MP</span>
        </button>`;
      }
      html += '</div>';
    }

    // Items (consumables)
    if (avail.items?.length > 0) {
      html += '<div class="item-list">';
      for (const it of avail.items) {
        const name = it.item?.name || it.id;
        html += `<button class="btn btn-action btn-item" data-action="item"
          data-item="${it.id}">🎒 ${name}</button>`;
      }
      html += '</div>';
    }

    // End Turn
    html += `<button class="btn btn-action btn-end-turn" data-action="end_turn">
      ⏭️ End Turn</button>`;

    html += '</div>';
    $actions.innerHTML = html;

    // Bind action buttons
    $actions.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => _onActionClick(btn));
    });
  }

  // ── ACTION BUTTON HANDLER ─────────────────────────────────────────
  function _onActionClick(btn) {
    const type = btn.dataset.action;
    const unit = CM().getCurrentUnit();
    if (!unit) return;

    switch (type) {
      case 'move':
        _enterMoveMode(unit);
        break;
      case 'attack':
        _enterTargetMode(unit, { type: 'attack' });
        break;
      case 'defend':
        _submitDirectAction({ type: 'defend' });
        break;
      case 'skill': {
        const skillId = btn.dataset.skill;
        const SR = window.CJS.SkillResolver;
        const skill = SR ? SR.resolveUnitSkill(unit, skillId) : DS().get('skills', skillId);
        if (skill?.aoe && skill.aoe !== 'none') {
          _enterAoETargetMode(unit, skill);
        } else {
          _enterTargetMode(unit, { type: 'skill', skillId });
        }
        break;
      }
      case 'item': {
        const itemId = btn.dataset.item;
        _enterTargetMode(unit, { type: 'item', itemId });
        break;
      }
      case 'end_turn':
        _submitDirectAction({ type: 'end_turn' });
        break;
    }
  }

  // ── MOVEMENT MODE ─────────────────────────────────────────────────
  function _enterMoveMode(unit) {
    _mode = 'move';
    const moves = GE().getValidMoves(unit.instanceId);
    const cells = [];
    if (Array.isArray(moves)) {
      for (const m of moves) {
        cells.push({ r: m[0], c: m[1] });
      }
    }
    GR().setHighlights(cells, 'rgba(59,130,246,0.4)', 'move');
    _setModeHint('Click a blue cell to move, or press Esc to cancel.');
  }

  // ── SINGLE TARGET MODE ────────────────────────────────────────────
  function _enterTargetMode(unit, action) {
    _mode = 'target_single';
    _pendingAction = action;

    // Highlight valid targets (use weapon range for attacks, SkillResolver for skills)
    let range;
    if (action.type === 'attack') {
      range = AH() && AH().getAttackRange ? AH().getAttackRange(unit) : 1 + (unit.rangeBonus || 0);
    } else {
      const SR = window.CJS.SkillResolver;
      const sk = SR ? SR.resolveUnitSkill(unit, action.skillId) : DS().get('skills', action.skillId);
      range = (sk?.range || 1) + (unit.rangeBonus || 0);
    }

    const targets = GE().getUnitsInRange(unit.pos[0], unit.pos[1], range, { excludeId: unit.instanceId });
    const cells = [];
    for (const entry of targets) {
      const t = entry.unit;
      if (t.currentHP > 0) {
        cells.push({ r: t.pos[0], c: t.pos[1] });
      }
    }
    GR().setHighlights(cells, 'rgba(239,68,68,0.4)', 'target');
    _setModeHint('Click an enemy to target, or press Esc to cancel.');
  }

  // ── AOE TARGET MODE ───────────────────────────────────────────────
  function _enterAoETargetMode(unit, skill) {
    _mode = 'target_aoe';
    _pendingAction = { type: 'skill', skillId: skill.id };

    // Highlight cells in range
    const range = (skill.range || 3) + (unit.rangeBonus || 0);
    const rawCells = GE().getCellsInRange(unit.pos[0], unit.pos[1], range);
    const validCells = rawCells.map(c => ({ r: c[0], c: c[1] }));
    GR().setHighlights(validCells, 'rgba(168,85,247,0.3)', 'target');
    _setModeHint('Click a cell for AoE center, or press Esc to cancel.');
  }

  // ── GRID CELL CLICK ───────────────────────────────────────────────
  function _onCellClick(r, c, e) {
    if (_mode === 'move') {
      const result = CM().submitAction({ type: 'move', targetPos: [r, c] });
      if (result.success) {
        GR().clearHighlights('move');
        _mode = 'idle';
        _clearModeHint();
        CM().runUntilInput();
      }
    } else if (_mode === 'target_single' || _mode === 'target_aoe') {
      const unitAt = GE().getUnitAt(r, c);
      const action = { ..._pendingAction };

      if (_mode === 'target_single' && unitAt) {
        action.targetId = unitAt.instanceId || unitAt;
      } else if (_mode === 'target_aoe') {
        action.aoeCenter = [r, c];
        // Also set targetId if there's a unit there
        if (unitAt) action.targetId = unitAt.instanceId || unitAt;
      } else {
        return; // No valid target
      }

      // Check if this skill needs QTE
      if (action.type === 'skill') {
        const SR = window.CJS.SkillResolver;
        const unit = CM().getCurrentUnit();
        const skill = (SR && unit) ? SR.resolveUnitSkill(unit, action.skillId) : DS().get('skills', action.skillId);
        if (skill?.qte && skill.qte !== 'none' && QM()) {
          _runQTE(skill, action);
          return;
        }
      }

      GR().clearHighlights('target');
      _mode = 'idle';
      _pendingAction = null;
      _clearModeHint();

      const result = CM().submitAction(action);
      _handleActionResult(result, action);
      CM().runUntilInput();
    }
  }

  function _onCellHover(r, c) {
    // Future: AoE preview on hover
  }

  // ── QTE INTEGRATION ───────────────────────────────────────────────
  async function _runQTE(skill, action) {
    _mode = 'qte';
    $qteOverlay.style.display = 'flex';

    try {
      const unit = CM().getCurrentUnit();
      const result = await QM().trigger({ skill, attacker: unit, container: $qteOverlay });
      action.qteResult = result;
    } catch (err) {
      action.qteResult = { grade: 'ok', multiplier: 1.0 };
    }

    $qteOverlay.style.display = 'none';
    $qteOverlay.innerHTML = '';

    GR().clearHighlights('target');
    _mode = 'idle';
    _pendingAction = null;
    _clearModeHint();

    const res = CM().submitAction(action);
    _handleActionResult(res, action);
    CM().runUntilInput();
  }

  // ── SUBMIT HELPERS ────────────────────────────────────────────────
  function _submitDirectAction(action) {
    _mode = 'idle';
    _pendingAction = null;
    GR().clearHighlights();
    _clearModeHint();

    const result = CM().submitAction(action);
    _handleActionResult(result, action);
    CM().runUntilInput();
  }

  function _handleActionResult(result, action) {
    if (!result.success) {
      _addLogMessage(`Action failed: ${result.reason}`, 'error');
    }
    // Show damage float on grid
    if (result.damage && result.targetUnit?.pos) {
      const color = result.isCritical ? '#fbbf24' : '#ff4444';
      GR().addDamageFloat(
        result.targetUnit.pos[0],
        result.targetUnit.pos[1],
        result.damage,
        color
      );
    }
    if (result.healing && result.targetUnit?.pos) {
      GR().addDamageFloat(
        result.targetUnit.pos[0],
        result.targetUnit.pos[1],
        '+' + result.healing,
        '#22c55e'
      );
    }
    _refresh();
  }

  // ── LOG & NARRATOR ────────────────────────────────────────────────
  function _onLogEntry(entry) {
    if (!entry) return;

    // Format log entry
    let msg = '';
    const actor = entry.actor?.name || entry.actor?.baseId || '';
    const target = entry.target?.name || entry.target?.baseId || '';

    switch (entry.type) {
      case 'hit':
        msg = `${actor} hits ${target} for ${entry.data?.damage || '?'} damage${entry.tags?.includes('crit') ? ' (CRIT!)' : ''}.`;
        break;
      case 'miss':
        msg = `${actor} misses ${target}.`;
        break;
      case 'dodge':
        msg = `${actor} dodges!`;
        break;
      case 'kill':
        msg = `${target} is defeated!`;
        break;
      case 'heal':
        msg = `${target} heals for ${entry.data?.amount || '?'} HP.`;
        break;
      case 'status_applied':
        msg = `${entry.data?.statusId} applied to ${target}.`;
        break;
      case 'status_tick':
        msg = `${entry.data?.statusId} ticks on ${target} (${entry.data?.amount || '?'}).`;
        break;
      case 'status_removed':
        msg = `${entry.data?.statusId} removed from ${target}.`;
        break;
      case 'move':
        msg = `${actor} moves.`;
        break;
      case 'skill_used':
        msg = `${actor} uses ${entry.data?.skill || '???'}.`;
        break;
      case 'qte_result':
        msg = `QTE: ${entry.data?.grade} (×${entry.data?.multiplier}).`;
        break;
      case 'turn_start':
        msg = `── Turn ${entry.data?.turn}: ${actor}'s turn ──`;
        break;
      case 'battle_start':
        msg = '═══ BATTLE START ═══';
        break;
      case 'battle_end':
        msg = `═══ BATTLE END — ${entry.data?.winner} wins! ═══`;
        break;
      case 'terrain_effect':
        msg = `🗺️ ${target} is affected by ${entry.data?.terrain || 'terrain'}.`;
        break;
      default:
        msg = entry.message || entry.type;
    }

    if (msg) _addLogMessage(msg, entry.type);

    // Damage float from log
    if (entry.type === 'hit' && entry.target?.pos) {
      GR().addDamageFloat(
        entry.target.pos[0], entry.target.pos[1],
        entry.data?.damage || '?',
        entry.tags?.includes('crit') ? '#fbbf24' : '#ff4444'
      );
    }
    if (entry.type === 'heal' && entry.target?.pos) {
      GR().addDamageFloat(
        entry.target.pos[0], entry.target.pos[1],
        '+' + (entry.data?.amount || '?'), '#22c55e'
      );
    }
    if (entry.type === 'status_tick' && entry.target?.pos && entry.data?.amount) {
      GR().addDamageFloat(
        entry.target.pos[0], entry.target.pos[1],
        entry.data.amount, '#c084fc'
      );
    }
  }

  function _onNarration(text, logEntry) {
    if (!text) return;
    const div = document.createElement('div');
    div.className = 'narrator-line';

    // Split CJS editorial onto own line with special styling
    const lines = text.split('\n');
    for (const line of lines) {
      const p = document.createElement('p');
      if (line.startsWith('[CJS]')) {
        p.className = 'narrator-cjs';
      }
      p.textContent = line;
      div.appendChild(p);
    }

    $narrator.appendChild(div);
    $narrator.scrollTop = $narrator.scrollHeight;

    // Trim old narration
    while ($narrator.children.length > 60) {
      $narrator.removeChild($narrator.firstChild);
    }
  }

  function _addLogMessage(text, type) {
    const div = document.createElement('div');
    div.className = `log-entry log-${type || 'note'}`;
    div.textContent = text;
    $log.appendChild(div);
    $log.scrollTop = $log.scrollHeight;

    while ($log.children.length > 200) {
      $log.removeChild($log.firstChild);
    }
  }

  // ── DICE MODE ──────────────────────────────────────────────────────
  function _setDiceMode(mode) {
    if (!CS()) return;
    CS().setDiceMode(mode);

    const btnAuto = _container.querySelector('#btn-dice-auto');
    const btnManual = _container.querySelector('#btn-dice-manual');
    const queueRow = _container.querySelector('#dice-queue-row');

    if (btnAuto) btnAuto.classList.toggle('active', mode === 'auto');
    if (btnManual) btnManual.classList.toggle('active', mode === 'prompt');
    if (queueRow) queueRow.style.display = (mode === 'prompt') ? '' : 'none';
  }

  // ── DICE PROMPT MODAL ─────────────────────────────────────────────
  function _showDicePromptModal(expression, source, resolve) {
    if (!$diceModal) { resolve(null); return; }

    const Dice = window.CJS.Dice;
    const parsed = Dice.parse(expression);
    const minVal = Dice.min(parsed);
    const maxVal = Dice.max(parsed);

    $diceModal.querySelector('#dice-modal-title').textContent = `🎲 Roll: ${expression}`;
    $diceModal.querySelector('#dice-modal-source').textContent = source ? `for: ${source}` : '';
    $diceModal.querySelector('#dice-modal-range').textContent = `Range: ${minVal} — ${maxVal}`;
    const inp = $diceModal.querySelector('#dice-modal-input');
    const errEl = $diceModal.querySelector('#dice-modal-error');
    inp.value = '';
    errEl.textContent = '';
    inp.min = minVal;
    inp.max = maxVal;
    $diceModal.style.display = 'flex';
    inp.focus();

    let resolved = false;
    function finish(val) {
      if (resolved) return;
      resolved = true;
      $diceModal.style.display = 'none';
      resolve(typeof val === 'number' ? val : null);
    }

    // Random button
    const randomBtn = $diceModal.querySelector('#dice-modal-random');
    const onRandom = () => {
      const result = Dice.roll(expression);
      inp.value = result.total;
      errEl.textContent = `Rolled: ${result.rolls?.join(' + ') || result.total}${result.modifier ? ' + ' + result.modifier : ''} = ${result.total}`;
    };
    randomBtn.onclick = onRandom;

    // Confirm button
    const confirmBtn = $diceModal.querySelector('#dice-modal-confirm');
    const onConfirm = () => {
      const v = parseInt(inp.value, 10);
      if (isNaN(v)) { errEl.textContent = 'Enter a number'; return; }
      if (v < minVal || v > maxVal) { errEl.textContent = `Must be ${minVal}–${maxVal}`; return; }
      finish(v);
    };
    confirmBtn.onclick = onConfirm;

    // Enter key confirms
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') onConfirm();
    };
  }

  // ── MODE HINT ─────────────────────────────────────────────────────
  function _setModeHint(text) {
    let hint = _container.querySelector('.mode-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'mode-hint';
      $actions.parentElement.insertBefore(hint, $actions.nextSibling);
    }
    hint.textContent = text;
    hint.style.display = 'block';
  }

  function _clearModeHint() {
    const hint = _container.querySelector('.mode-hint');
    if (hint) hint.style.display = 'none';
  }

  // ── BATTLE END ────────────────────────────────────────────────────
  function _showBattleEnd(state) {
    $actions.innerHTML = `
      <div class="battle-end-panel ${state.winner === 'player' ? 'victory' : 'defeat'}">
        <h2>${state.winner === 'player' ? '⚔️ VICTORY!' : '💀 DEFEAT'}</h2>
        <p>Round ${state.roundNumber}</p>
        <div class="battle-end-buttons">
          <button class="btn btn-primary" id="btn-show-loot">
            ${state.winner === 'player' ? '🎁 Collect Loot' : '📋 Summary'}
          </button>
          <button class="btn" id="btn-restart-combat">🔄 Restart</button>
        </div>
      </div>
    `;

    _container.querySelector('#btn-show-loot')?.addEventListener('click', () => {
      if (window.CJS.LootRoller && state.winner === 'player') {
        const units = CM().getUnits().filter(u => u.team === 'enemy');
        window.CJS.LootRoller.rollAndDisplay(units, $actions);
      }
    });

    _container.querySelector('#btn-restart-combat')?.addEventListener('click', () => {
      CM().reset();
      $log.innerHTML = '';
      $narrator.innerHTML = '';
      _refresh();
    });
  }

  // ── AUTO BUTTONS ──────────────────────────────────────────────────
  function _updateAutoButtons(state) {
    const stopBtn = _container.querySelector('#btn-stop-auto');
    if (stopBtn && state.phase === 'battle_end') {
      stopBtn.style.display = 'none';
    }
  }

  // ── KEYBOARD ──────────────────────────────────────────────────────
  function _handleKeydown(e) {
    if (e.key === 'Escape') {
      if (_mode !== 'idle' && _mode !== 'qte') {
        _mode = 'idle';
        _pendingAction = null;
        GR().clearHighlights();
        _clearModeHint();
        _refresh();
      }
    }
  }

  // ── STATUS ICON HELPER ────────────────────────────────────────────
  function _statusIcon(id) {
    const map = {
      burn:'🔥', poison:'☠️', bleed:'🩸', stun:'💫', freeze:'🧊',
      sleep:'💤', silence:'🤐', regen:'💚', shield:'🛡️', haste:'⚡',
      berserk:'😡', slow:'🐌', root:'🌿', blind:'🌑', confuse:'😵',
      fear:'😨', charm:'💕', doom:'💀', taunt:'😤', petrify:'🪨'
    };
    return map[id] || '✦';
  }

  // ── DESTROY ───────────────────────────────────────────────────────
  function destroy() {
    if (_unsubCM) _unsubCM();
    if (_unsubLog) _unsubLog();
    if (_unsubNarrator) _unsubNarrator();
    GR().destroy();
    NE().destroy();
    document.removeEventListener('keydown', _handleKeydown);
    if (_container) _container.innerHTML = '';
  }

  // Bind keyboard globally
  document.addEventListener('keydown', _handleKeydown);

  // ── PUBLIC API ────────────────────────────────────────────────────
  return Object.freeze({
    init,
    startCombat,
    destroy
  });
})();
