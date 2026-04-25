// combat-ui.js
// Combat screen UI controller. Binds CombatManager, GridRenderer,
// NarratorEngine, and QTE modules into a cohesive combat experience.

window.CJS = window.CJS || {};

window.CJS.CombatUI = (() => {
  'use strict';

  const CM = () => window.CJS.CombatManager;
  const GE = () => window.CJS.GridEngine;
  const GR = () => window.CJS.GridRenderer;
  const AH = () => window.CJS.ActionHandler;
  const NE = () => window.CJS.NarratorEngine;
  const ND = () => window.CJS.NarratorData;
  const DS = () => window.CJS.DataStore;
  const QM = () => window.CJS.QteManager;
  const CS = () => window.CJS.CombatSettings;
  const Log = () => window.CJS.CombatLog;

  let _container = null;
  let _callbacks = {};
  let _mode = 'idle';
  let _pendingAction = null;
  let _lastEncounterId = null;

  let _unsubCM = null;
  let _unsubLog = null;
  let _unsubNarrator = null;
  let _keyboardBound = false;
  let _resizeBound = false;

  let $grid = null;
  let $log = null;
  let $actions = null;
  let $initiative = null;
  let $unitInfo = null;
  let $narrator = null;
  let $qteOverlay = null;
  let $diceModal = null;

  function init(containerEl, options = {}) {
    destroy();
    _container = containerEl;
    _callbacks = { ...options };
    _mode = 'idle';
    _pendingAction = null;

    _buildLayout();
    _bindEvents();
    _bindWindowEvents();

    if (CS()) {
      _setDiceMode(CS().getDiceMode ? CS().getDiceMode() : 'auto');
    }
  }

  function _buildLayout() {
    if (!_container) return;

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
            <div class="dice-controls">
              <div class="dice-mode-row">
                <span class="dice-label">Dice:</span>
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
            <div class="dice-modal-title" id="dice-modal-title">Roll</div>
            <div class="dice-modal-source" id="dice-modal-source"></div>
            <div class="dice-modal-range" id="dice-modal-range"></div>
            <input type="number" id="dice-modal-input" class="dice-modal-field" placeholder="Enter value...">
            <div class="dice-modal-buttons">
              <button id="dice-modal-random" class="btn btn-sm">Random</button>
              <button id="dice-modal-confirm" class="btn btn-primary btn-sm">Confirm</button>
            </div>
            <div class="dice-modal-error" id="dice-modal-error"></div>
          </div>
        </div>
      </div>
    `;

    $grid = _container.querySelector('.combat-grid-wrap');
    $log = _container.querySelector('#cbt-log');
    $actions = _container.querySelector('#cbt-actions');
    $initiative = _container.querySelector('#cbt-initiative');
    $unitInfo = _container.querySelector('#cbt-unit-info');
    $narrator = _container.querySelector('#cbt-narrator');
    $qteOverlay = _container.querySelector('#cbt-qte-overlay');
    $diceModal = _container.querySelector('#cbt-dice-modal');

    const canvas = _container.querySelector('#cbt-canvas');
    GR().init(canvas, {
      cellSize: 64,
      onCellClick: _onCellClick,
      onCellHover: _onCellHover
    });
  }

  function _bindEvents() {
    _container.querySelector('#btn-dice-auto')?.addEventListener('click', () => {
      _setDiceMode('auto');
    });

    _container.querySelector('#btn-dice-manual')?.addEventListener('click', () => {
      _setDiceMode('prompt');
    });

    _container.querySelector('#btn-dice-queue')?.addEventListener('click', () => {
      const input = _container.querySelector('#dice-queue-input');
      const values = (input?.value || '')
        .split(/[,\s]+/)
        .map(Number)
        .filter((value) => !Number.isNaN(value) && value > 0);

      if (values.length > 0 && CS()) {
        CS().queueDice(values);
        input.value = '';
        _addLogMessage(`Queued ${values.length} dice: [${values.join(', ')}]`, 'note');
      }
    });

    if (CS()) {
      CS().setDicePromptFn((expression, source) => {
        const Dice = window.CJS.Dice;
        const parsed = Dice.parse(expression);
        const minVal = Dice.min(parsed);
        const maxVal = Dice.max(parsed);

        const input = window.prompt(
          `Roll: ${expression} (for: ${source || 'roll'})\n`
          + `Range: ${minVal} - ${maxVal}\n\n`
          + 'Enter a value, or leave blank for random:'
        );

        if (input === null || input.trim() === '') return null;

        const value = parseInt(input, 10);
        if (Number.isNaN(value) || value < minVal || value > maxVal) return null;
        return value;
      });
    }

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

  function _bindWindowEvents() {
    if (!_keyboardBound) {
      document.addEventListener('keydown', _handleKeydown);
      _keyboardBound = true;
    }

    if (!_resizeBound) {
      window.addEventListener('resize', _handleResize);
      _resizeBound = true;
    }
  }

  function _detachSubscriptions() {
    if (_unsubCM) {
      _unsubCM();
      _unsubCM = null;
    }
    if (_unsubLog) {
      _unsubLog();
      _unsubLog = null;
    }
    if (_unsubNarrator) {
      _unsubNarrator();
      _unsubNarrator = null;
    }
  }

  function _clearFeedPanels() {
    if ($log) $log.innerHTML = '';
    if ($narrator) $narrator.innerHTML = '';
  }

  function startCombat(encounterId) {
    if (!_container) {
      throw new Error('CombatUI.init must be called before startCombat.');
    }

    _lastEncounterId = encounterId;
    _mode = 'idle';
    _pendingAction = null;
    _clearModeHint();
    _clearFeedPanels();

    _detachSubscriptions();
    try { NE().destroy(); } catch (_) {}

    try {
      if (ND().isLoaded()) {
        NE().init();
        _unsubNarrator = NE().subscribe(_onNarration);
      }
    } catch (error) {
      console.warn('Narrator init failed (non-fatal):', error.message);
    }

    _unsubLog = Log().subscribe(_onLogEntry);

    CM().startEncounter(encounterId);
    _unsubCM = CM().subscribe(_onStateChange);
    GR().resize();

    const portraitPicker = window.CJS.PortraitPicker;
    if (portraitPicker) {
      for (const unit of CM().getUnits()) {
        if (unit?.portrait) portraitPicker.preloadImage(unit.portrait);
      }
    }

    const phase = CM().runUntilInput();
    _refresh();
    return phase;
  }

  function _onStateChange() {
    _refresh();
  }

  function _refresh() {
    const state = CM().getState();
    if (!state) return;

    _renderInitiative(state);
    _renderUnitInfo(state);
    _renderActions(state);
    _updateAutoButtons(state);

    const unit = CM().getCurrentUnit();
    GR().setSelectedUnit(unit?.instanceId || null);

    if (state.phase === 'battle_end') {
      _showBattleEnd(state);
    }
  }

  function _renderInitiative(state) {
    const order = CM().getInitiativeOrder();
    let html = '';

    for (const unit of order) {
      if (!unit) continue;

      const active = unit.instanceId === state.currentUnitId;
      const dead = unit.currentHP <= 0;
      const teamClass = unit.team === 'player' ? 'init-player' : 'init-enemy';
      const classes = `init-unit ${teamClass}${active ? ' init-active' : ''}${dead ? ' init-dead' : ''}`;
      const hpPct = Math.round((unit.currentHP / (unit.maxHP || 1)) * 100);
      const portraitHtml = _renderPortraitMarkup(unit.portrait, 'init-portrait', 'init-icon', unit.icon || '?');

      html += `
        <div class="${classes}" title="${_escAttr(unit.name || unit.baseId || '?')} (${unit.currentHP}/${unit.maxHP} HP)">
          ${portraitHtml}
          <span class="init-name">${_escHtml((unit.name || unit.baseId || '?').substring(0, 6))}</span>
          <div class="init-hp-bar"><div class="init-hp-fill" style="width:${hpPct}%"></div></div>
        </div>
      `;
    }

    $initiative.innerHTML = html;
  }

  function _renderUnitInfo() {
    const unit = CM().getCurrentUnit();
    if (!unit) {
      $unitInfo.innerHTML = '<div class="unit-info-empty">Waiting...</div>';
      return;
    }

    const turnState = unit.turnState || {};
    const hpPct = Math.round((unit.currentHP / (unit.maxHP || 1)) * 100);
    const mpPct = unit.maxMP ? Math.round(((unit.currentMP || 0) / unit.maxMP) * 100) : 0;

    const statusHtml = unit.activeStatuses?.length
      ? `<div class="unit-statuses">${unit.activeStatuses.map((status) => (
          `<span class="status-chip" title="${_escAttr(`${status.statusId} (${status.duration}t, ${status.stacks}stk)`)}">${_escHtml(_statusIcon(status.statusId))} ${status.duration}t</span>`
        )).join('')}</div>`
      : '';

    const portraitHtml = _renderPortraitMarkup(unit.portrait, 'unit-portrait', 'unit-icon-lg', unit.icon || '?');

    $unitInfo.innerHTML = `
      <div class="unit-card ${_escAttr(unit.team || 'player')}">
        <div class="unit-header">
          ${portraitHtml}
          <div>
            <div class="unit-name">${_escHtml(unit.name || unit.baseId || '?')}</div>
            <div class="unit-rank">Rank ${_escHtml(unit.rank || '?')} ${_escHtml(unit.type || '')}</div>
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
          <span class="${turnState.hasMoved ? 'used' : 'available'}">Move: ${turnState.hasMoved ? 'Used' : 'Ready'}</span>
          <span class="${turnState.mainActionUsed ? 'used' : 'available'}">Action: ${turnState.mainActionUsed ? 'Used' : 'Ready'}</span>
          <span>AP: ${turnState.apRemaining || 0}</span>
        </div>
        ${statusHtml}
      </div>
    `;
  }

  function _renderActions(state) {
    if (state.phase === 'battle_end') {
      return;
    }

    if (!CM().isAwaitingInput() && state.phase !== 'action') {
      $actions.innerHTML = '<div class="action-wait">Processing...</div>';
      return;
    }

    const unit = CM().getCurrentUnit();
    if (!unit) {
      $actions.innerHTML = '';
      return;
    }

    if (!CM().isManualTurn()) {
      $actions.innerHTML = '<div class="action-wait">AI is thinking...</div>';
      return;
    }

    const available = CM().getAvailableActionsForCurrent();
    if (!available) {
      $actions.innerHTML = '';
      return;
    }

    let html = '<div class="action-buttons">';

    if (available.move) {
      html += '<button class="btn btn-action btn-move" data-action="move">Move</button>';
    }

    if (available.attack) {
      html += '<button class="btn btn-action btn-attack" data-action="attack">Attack</button>';
    }

    if (available.defend) {
      html += '<button class="btn btn-action btn-defend" data-action="defend">Defend</button>';
    }

    if (available.skills?.length > 0) {
      html += '<div class="skill-list">';
      for (const skillEntry of available.skills) {
        const skillName = skillEntry.skill?.name || skillEntry.id;
        const skillIcon = skillEntry.skill?.icon || '*';
        const disabled = !skillEntry.usable ? 'disabled' : '';
        const reason = skillEntry.cooldown > 0 ? `title="Cooldown: ${skillEntry.cooldown} turns"` : '';
        html += `
          <button class="btn btn-action btn-skill" data-action="skill" data-skill="${_escAttr(skillEntry.id)}" ${disabled} ${reason}>
            ${_escHtml(skillIcon)} ${_escHtml(skillName)}
            <span class="skill-cost">${skillEntry.apCost || 0}AP ${skillEntry.mpCost || 0}MP</span>
          </button>
        `;
      }
      html += '</div>';
    }

    if (available.items?.length > 0) {
      html += '<div class="item-list">';
      for (const itemEntry of available.items) {
        const itemName = itemEntry.item?.name || itemEntry.id;
        html += `
          <button class="btn btn-action btn-item" data-action="item" data-item="${_escAttr(itemEntry.id)}">
            Item ${_escHtml(itemName)}
          </button>
        `;
      }
      html += '</div>';
    }

    html += '<button class="btn btn-action btn-end-turn" data-action="end_turn">End Turn</button>';
    html += '</div>';
    $actions.innerHTML = html;

    $actions.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => _onActionClick(button));
    });
  }

  function _onActionClick(button) {
    const type = button.dataset.action;
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
        const skillId = button.dataset.skill;
        const resolver = window.CJS.SkillResolver;
        const skill = resolver ? resolver.resolveUnitSkill(unit, skillId) : DS().get('skills', skillId);
        if (skill?.aoe && skill.aoe !== 'none') {
          _enterAoETargetMode(unit, skill);
        } else {
          _enterTargetMode(unit, { type: 'skill', skillId });
        }
        break;
      }
      case 'item':
        _enterTargetMode(unit, { type: 'item', itemId: button.dataset.item });
        break;
      case 'end_turn':
        _submitDirectAction({ type: 'end_turn' });
        break;
      default:
        break;
    }
  }

  function _enterMoveMode(unit) {
    _mode = 'move';
    const moves = GE().getValidMoves(unit.instanceId);
    const cells = Array.isArray(moves) ? moves.map(([r, c]) => ({ r, c })) : [];
    GR().setHighlights(cells, 'rgba(59,130,246,0.4)', 'move');
    _setModeHint('Click a blue cell to move, or press Esc to cancel.');
  }

  function _enterTargetMode(unit, action) {
    _mode = 'target_single';
    _pendingAction = action;

    let range = 1 + (unit.rangeBonus || 0);
    if (action.type !== 'attack') {
      const resolver = window.CJS.SkillResolver;
      const skill = resolver ? resolver.resolveUnitSkill(unit, action.skillId) : DS().get('skills', action.skillId);
      range = (skill?.range || 1) + (unit.rangeBonus || 0);
    } else if (AH() && AH().getAttackRange) {
      range = AH().getAttackRange(unit);
    }

    const targets = GE().getUnitsInRange(unit.pos[0], unit.pos[1], range, { excludeId: unit.instanceId });
    const cells = [];

    for (const entry of targets) {
      const target = entry.unit;
      if (target.currentHP > 0) {
        cells.push({ r: target.pos[0], c: target.pos[1] });
      }
    }

    GR().setHighlights(cells, 'rgba(239,68,68,0.4)', 'target');
    _setModeHint('Click a valid target, or press Esc to cancel.');
  }

  function _enterAoETargetMode(unit, skill) {
    _mode = 'target_aoe';
    _pendingAction = { type: 'skill', skillId: skill.id };

    const range = (skill.range || 3) + (unit.rangeBonus || 0);
    const rawCells = GE().getCellsInRange(unit.pos[0], unit.pos[1], range);
    const cells = rawCells.map(([r, c]) => ({ r, c }));
    GR().setHighlights(cells, 'rgba(168,85,247,0.3)', 'target');
    _setModeHint('Click a cell for the AoE center, or press Esc to cancel.');
  }

  function _onCellClick(r, c) {
    if (_mode === 'move') {
      const result = CM().submitAction({ type: 'move', targetPos: [r, c] });
      if (result.success) {
        GR().clearHighlights('move');
        _mode = 'idle';
        _clearModeHint();
        CM().runUntilInput();
      }
      return;
    }

    if (_mode !== 'target_single' && _mode !== 'target_aoe') {
      return;
    }

    const unitAt = GE().getUnitAt(r, c);
    const action = { ..._pendingAction };

    if (_mode === 'target_single') {
      if (!unitAt) return;
      action.targetId = unitAt.instanceId || unitAt;
    } else {
      action.aoeCenter = [r, c];
      if (unitAt) action.targetId = unitAt.instanceId || unitAt;
    }

    if (action.type === 'skill') {
      const resolver = window.CJS.SkillResolver;
      const unit = CM().getCurrentUnit();
      const skill = (resolver && unit) ? resolver.resolveUnitSkill(unit, action.skillId) : DS().get('skills', action.skillId);
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
    _handleActionResult(result);
    CM().runUntilInput();
  }

  function _onCellHover() {
    // Reserved for future hover previews.
  }

  async function _runQTE(skill, action) {
    _mode = 'qte';
    $qteOverlay.style.display = 'flex';

    try {
      const unit = CM().getCurrentUnit();
      const result = await QM().trigger({ skill, attacker: unit, container: $qteOverlay });
      action.qteResult = result;
    } catch (_) {
      action.qteResult = { grade: 'ok', multiplier: 1.0 };
    }

    $qteOverlay.style.display = 'none';
    $qteOverlay.innerHTML = '';
    GR().clearHighlights('target');

    _mode = 'idle';
    _pendingAction = null;
    _clearModeHint();

    const result = CM().submitAction(action);
    _handleActionResult(result);
    CM().runUntilInput();
  }

  function _submitDirectAction(action) {
    _mode = 'idle';
    _pendingAction = null;
    GR().clearHighlights();
    _clearModeHint();

    const result = CM().submitAction(action);
    _handleActionResult(result);
    CM().runUntilInput();
  }

  function _handleActionResult(result) {
    if (!result.success) {
      _addLogMessage(`Action failed: ${result.reason}`, 'error');
      return;
    }

    if (result.damage && result.targetUnit?.pos) {
      const color = result.isCritical ? '#fbbf24' : '#ff4444';
      GR().addDamageFloat(result.targetUnit.pos[0], result.targetUnit.pos[1], result.damage, color);
    }

    if (result.healing && result.targetUnit?.pos) {
      GR().addDamageFloat(result.targetUnit.pos[0], result.targetUnit.pos[1], `+${result.healing}`, '#22c55e');
    }

    _refresh();
  }

  function _onLogEntry(entry) {
    if (!entry) return;

    let message = '';
    const actor = entry.actor?.name || entry.actor?.baseId || 'Someone';
    const target = entry.target?.name || entry.target?.baseId || 'Target';

    switch (entry.type) {
      case 'hit':
        message = `${actor} hits ${target} for ${entry.data?.damage || '?'} damage${entry.tags?.includes('crit') ? ' (crit)' : ''}.`;
        break;
      case 'miss':
        message = `${actor} misses ${target}.`;
        break;
      case 'dodge':
        message = `${actor} dodges.`;
        break;
      case 'kill':
        message = `${target} is defeated.`;
        break;
      case 'heal':
        message = `${target} heals for ${entry.data?.amount || '?'} HP.`;
        break;
      case 'status_applied':
        message = `${entry.data?.statusId} applied to ${target}.`;
        break;
      case 'status_tick':
        message = `${entry.data?.statusId} ticks on ${target} (${entry.data?.amount || '?'}).`;
        break;
      case 'status_removed':
        message = `${entry.data?.statusId} removed from ${target}.`;
        break;
      case 'move':
        message = `${actor} moves.`;
        break;
      case 'skill_used':
        message = `${actor} uses ${entry.data?.skill || 'a skill'}.`;
        break;
      case 'qte_result':
        message = `QTE: ${entry.data?.grade || 'ok'} (${entry.data?.multiplier || 1}x).`;
        break;
      case 'turn_start':
        message = `Turn ${entry.data?.turn}: ${actor}'s turn.`;
        break;
      case 'battle_start':
        message = 'Battle start.';
        break;
      case 'battle_end':
        message = `Battle end: ${entry.data?.winner || 'unknown'} wins.`;
        break;
      case 'terrain_effect':
        message = `${target} is affected by ${entry.data?.terrain || 'terrain'}.`;
        break;
      default:
        message = entry.message || entry.type;
        break;
    }

    if (message) _addLogMessage(message, entry.type);

    if (entry.type === 'hit' && entry.target?.pos) {
      GR().addDamageFloat(
        entry.target.pos[0],
        entry.target.pos[1],
        entry.data?.damage || '?',
        entry.tags?.includes('crit') ? '#fbbf24' : '#ff4444'
      );
    }

    if (entry.type === 'heal' && entry.target?.pos) {
      GR().addDamageFloat(entry.target.pos[0], entry.target.pos[1], `+${entry.data?.amount || '?'}`, '#22c55e');
    }

    if (entry.type === 'status_tick' && entry.target?.pos && entry.data?.amount) {
      GR().addDamageFloat(entry.target.pos[0], entry.target.pos[1], entry.data.amount, '#c084fc');
    }
  }

  function _onNarration(text) {
    if (!text || !$narrator) return;

    const block = document.createElement('div');
    block.className = 'narrator-line';

    for (const line of text.split('\n')) {
      const paragraph = document.createElement('p');
      if (line.startsWith('[CJS]')) {
        paragraph.className = 'narrator-cjs';
      }
      paragraph.textContent = line;
      block.appendChild(paragraph);
    }

    $narrator.appendChild(block);
    $narrator.scrollTop = $narrator.scrollHeight;

    while ($narrator.children.length > 60) {
      $narrator.removeChild($narrator.firstChild);
    }
  }

  function _addLogMessage(text, type) {
    if (!$log) return;

    const div = document.createElement('div');
    div.className = `log-entry log-${type || 'note'}`;
    div.textContent = text;
    $log.appendChild(div);
    $log.scrollTop = $log.scrollHeight;

    while ($log.children.length > 200) {
      $log.removeChild($log.firstChild);
    }
  }

  function _setDiceMode(mode) {
    if (!CS()) return;

    CS().setDiceMode(mode);

    const btnAuto = _container.querySelector('#btn-dice-auto');
    const btnManual = _container.querySelector('#btn-dice-manual');
    const queueRow = _container.querySelector('#dice-queue-row');

    btnAuto?.classList.toggle('active', mode === 'auto');
    btnManual?.classList.toggle('active', mode === 'prompt');
    if (queueRow) {
      queueRow.style.display = mode === 'prompt' ? '' : 'none';
    }
  }

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
    const hint = _container?.querySelector('.mode-hint');
    if (hint) hint.style.display = 'none';
  }

  function _showBattleEnd(state) {
    const showReturnButton = typeof _callbacks.onReturnToSetup === 'function';

    $actions.innerHTML = `
      <div class="battle-end-panel ${state.winner === 'player' ? 'victory' : 'defeat'}">
        <h2>${state.winner === 'player' ? 'Victory' : 'Defeat'}</h2>
        <p>Round ${state.roundNumber}</p>
        <div class="battle-end-buttons">
          <button class="btn btn-primary" id="btn-show-loot">${state.winner === 'player' ? 'Collect Loot' : 'Summary'}</button>
          <button class="btn" id="btn-restart-combat">Restart</button>
          ${showReturnButton ? '<button class="btn" id="btn-return-setup">Back to Setup</button>' : ''}
        </div>
      </div>
    `;

    _container.querySelector('#btn-show-loot')?.addEventListener('click', () => {
      if (window.CJS.LootRoller && state.winner === 'player') {
        const enemies = CM().getUnits().filter((unit) => unit.team === 'enemy');
        window.CJS.LootRoller.rollAndDisplay(enemies, $actions);
      }
    });

    _container.querySelector('#btn-restart-combat')?.addEventListener('click', () => {
      _restartCombat();
    });

    _container.querySelector('#btn-return-setup')?.addEventListener('click', () => {
      _callbacks.onReturnToSetup?.();
    });
  }

  function _restartCombat() {
    if (!_lastEncounterId) return;
    startCombat(_lastEncounterId);
  }

  function _updateAutoButtons(state) {
    const stopBtn = _container.querySelector('#btn-stop-auto');
    if (!stopBtn) return;

    stopBtn.style.display = state.phase === 'battle_end' ? 'none' : stopBtn.style.display;
  }

  function _handleResize() {
    if (_container && CM().getState()) {
      GR().resize();
    }
  }

  function _handleKeydown(event) {
    if (event.key !== 'Escape') return;

    if (_mode !== 'idle' && _mode !== 'qte') {
      _mode = 'idle';
      _pendingAction = null;
      GR().clearHighlights();
      _clearModeHint();
      _refresh();
    }
  }

  function _statusIcon(id) {
    const icons = {
      burn: 'B',
      poison: 'P',
      bleed: 'L',
      stun: 'S',
      freeze: 'F',
      sleep: 'Z',
      silence: 'Q',
      regen: '+',
      shield: '#',
      haste: 'H',
      berserk: '!',
      slow: '-',
      root: 'R',
      blind: 'O',
      confuse: '?',
      fear: '!',
      charm: 'C',
      doom: 'D',
      taunt: 'T',
      petrify: 'X'
    };
    return icons[id] || '*';
  }

  function _renderPortraitMarkup(path, imageClass, fallbackClass, icon) {
    if (!path) return `<span class="${fallbackClass}">${_escHtml(icon || '?')}</span>`;

    return `
      <img src="${_escAttr(path)}" class="${imageClass}" onerror="this.style.display='none';this.nextElementSibling.style.display=''" alt="">
      <span class="${fallbackClass}" style="display:none">${_escHtml(icon || '?')}</span>
    `;
  }

  function _escHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function _escAttr(value) {
    return _escHtml(value);
  }

  function destroy() {
    _detachSubscriptions();

    try { NE().destroy(); } catch (_) {}
    try { GR().destroy(); } catch (_) {}

    if (_keyboardBound) {
      document.removeEventListener('keydown', _handleKeydown);
      _keyboardBound = false;
    }

    if (_resizeBound) {
      window.removeEventListener('resize', _handleResize);
      _resizeBound = false;
    }

    _mode = 'idle';
    _pendingAction = null;
    _callbacks = {};

    if (_container) {
      _container.innerHTML = '';
    }

    _container = null;
    $grid = null;
    $log = null;
    $actions = null;
    $initiative = null;
    $unitInfo = null;
    $narrator = null;
    $qteOverlay = null;
    $diceModal = null;
  }

  return Object.freeze({
    init,
    startCombat,
    destroy
  });
})();
