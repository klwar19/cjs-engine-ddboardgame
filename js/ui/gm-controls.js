// gm-controls.js
// Game Master live-edit panel for combat. Lets the operator add, remove,
// move, damage, heal, status-fy, or terrain-paint anything on the
// battlefield while the encounter is running.
//
// Reads:  CombatManager (state + GM helpers), GridEngine, GridRenderer,
//         DataStore (monsters/statuses), CONST (terrain types).
// Used by: combat-ui.js (mounts the panel into the sidebar and forwards
//         grid clicks while a GM tool is active).
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.GMControls = (() => {
  'use strict';

  const CM = () => window.CJS.CombatManager;
  const GE = () => window.CJS.GridEngine;
  const GR = () => window.CJS.GridRenderer;
  const DS = () => window.CJS.DataStore;
  const C  = () => window.CJS.CONST;
  const SM = () => window.CJS.StatusManager;

  let _root = null;          // panel element
  let _refreshFn = null;     // combat-ui refresh callback
  let _hintFn = null;        // combat-ui mode-hint setter
  let _clearHintFn = null;
  let _tool = null;          // active tool: 'place' | 'move' | 'remove' | 'damage' | 'heal' | 'status' | 'terrain' | 'inspect' | null
  let _toolCtx = null;       // { monsterId, statusId, terrainType, team, size, duration, amount }
  let _movingUnitId = null;  // mid-move selection

  // ── PUBLIC: mount the panel into a host element ───────────────────
  function mount(hostEl, opts = {}) {
    if (!hostEl) return;
    _refreshFn = opts.onRefresh || null;
    _hintFn = opts.onHint || null;
    _clearHintFn = opts.onClearHint || null;
    _root = hostEl;
    _render();
    _bind();
  }

  function unmount() {
    _root = null;
    _refreshFn = null;
    _hintFn = null;
    _clearHintFn = null;
    _tool = null;
    _toolCtx = null;
    _movingUnitId = null;
  }

  function isToolActive() {
    return _tool !== null;
  }

  function getActiveTool() {
    return _tool;
  }

  // Called by combat-ui when the user clicks a cell while a tool is active.
  // Returns true if the click was handled (so combat-ui should NOT process
  // it as a player action).
  function handleCellClick(r, c) {
    if (!_tool) return false;

    switch (_tool) {
      case 'place':       return _onPlaceClick(r, c);
      case 'move':        return _onMoveClick(r, c);
      case 'remove':      return _onRemoveClick(r, c);
      case 'damage':      return _onDamageClick(r, c);
      case 'heal':        return _onHealClick(r, c);
      case 'status':      return _onStatusClick(r, c);
      case 'cleanse':     return _onCleanseClick(r, c);
      case 'terrain':     return _onTerrainClick(r, c);
      case 'inspect':     return _onInspectClick(r, c);
      default:            return false;
    }
  }

  function cancelTool() {
    _tool = null;
    _toolCtx = null;
    _movingUnitId = null;
    GR()?.clearHighlights('gm');
    _clearHintFn?.();
    _syncToolButtons();
  }

  // Re-render dropdowns/state when the panel needs a refresh
  // (e.g. after data import added more monsters).
  function refresh() {
    if (_root) _render();
    _bind();
  }

  // ── RENDER ────────────────────────────────────────────────────────
  function _render() {
    const monsters = DS().getAllAsArray('monsters') || [];
    const characters = (DS().getAllAsArray('characters') || []).filter(c => c?.team !== 'enemy');
    const statuses = _statusList();
    const terrains = Object.keys(C().TERRAIN_TYPES || {});

    const unitOptions = [
      '<optgroup label="Monsters">',
      ...monsters.map(m => `<option value="${_esc(m.id)}">${_esc(m.name || m.id)}</option>`),
      '</optgroup>',
      '<optgroup label="Characters">',
      ...characters.map(c => `<option value="${_esc(c.id)}">${_esc(c.name || c.id)}</option>`),
      '</optgroup>'
    ].join('');

    const statusOptions = statuses
      .map(s => `<option value="${_esc(s.id)}">${_esc(s.icon ? s.icon + ' ' : '')}${_esc(s.name || s.id)}</option>`)
      .join('');

    const terrainOptions = terrains
      .map(t => {
        const td = C().TERRAIN_TYPES[t] || {};
        const label = `${td.icon || ''} ${t}`.trim();
        return `<option value="${_esc(t)}">${_esc(label)}</option>`;
      })
      .join('');

    const weathers = DS().getAllAsArray('weathers') || [];
    const weatherOptions = weathers.length
      ? weathers.map(w => `<option value="${_esc(w.id)}">${_esc(w.icon ? w.icon + ' ' : '')}${_esc(w.name || w.id)}</option>`).join('')
      : '<option value="normal">☀️ Clear</option>';

    const sizeOptions = Object.entries(C().UNIT_SIZES || { '1x1': { label: '1×1' } })
      .map(([k, v]) => `<option value="${_esc(k)}">${_esc(v.label || k)}</option>`)
      .join('');

    _root.innerHTML = `
      <div class="gm-panel">
        <div class="gm-section">
          <div class="gm-section-head">Spawn Unit</div>
          <div class="gm-row">
            <select id="gm-spawn-id" class="gm-input">${unitOptions}</select>
          </div>
          <div class="gm-row">
            <label class="gm-inline">Team
              <select id="gm-spawn-team" class="gm-input gm-input-sm">
                <option value="enemy">Enemy</option>
                <option value="player">Player</option>
              </select>
            </label>
            <label class="gm-inline">Size
              <select id="gm-spawn-size" class="gm-input gm-input-sm">${sizeOptions}</select>
            </label>
          </div>
          <div class="gm-row">
            <button class="btn btn-sm gm-tool-btn" data-tool="place">Place on Grid</button>
          </div>
        </div>

        <div class="gm-section">
          <div class="gm-section-head">Unit Tools</div>
          <div class="gm-row gm-grid-2">
            <button class="btn btn-sm gm-tool-btn" data-tool="move">Move Unit</button>
            <button class="btn btn-sm gm-tool-btn btn-danger" data-tool="remove">Remove Unit</button>
            <button class="btn btn-sm gm-tool-btn" data-tool="damage">Damage…</button>
            <button class="btn btn-sm gm-tool-btn" data-tool="heal">Heal…</button>
            <button class="btn btn-sm gm-tool-btn" data-tool="inspect">Inspect</button>
            <button class="btn btn-sm gm-tool-btn" data-tool="cleanse">Cleanse</button>
          </div>
        </div>

        <div class="gm-section">
          <div class="gm-section-head">Status Painter</div>
          <div class="gm-row">
            <select id="gm-status-id" class="gm-input">${statusOptions || '<option value="">(no statuses)</option>'}</select>
            <input type="number" id="gm-status-duration" class="gm-input gm-input-sm" value="3" min="1" max="99" title="Duration (turns)">
          </div>
          <div class="gm-row">
            <button class="btn btn-sm gm-tool-btn" data-tool="status">Apply to Unit</button>
          </div>
        </div>

        <div class="gm-section">
          <div class="gm-section-head">Terrain Painter</div>
          <div class="gm-row">
            <select id="gm-terrain-id" class="gm-input">${terrainOptions}</select>
          </div>
          <div class="gm-row">
            <button class="btn btn-sm gm-tool-btn" data-tool="terrain">Paint Cell</button>
          </div>
        </div>

        <div class="gm-section">
          <div class="gm-section-head">Weather</div>
          <div class="gm-row">
            <select id="gm-weather-id" class="gm-input">${weatherOptions}</select>
            <input type="number" id="gm-weather-duration" class="gm-input gm-input-sm" value="4" min="1" max="99" title="Duration (turns)">
          </div>
          <div class="gm-row">
            <button class="btn btn-sm" id="gm-weather-apply">Set Weather</button>
            <button class="btn btn-sm" id="gm-weather-clear">Clear</button>
          </div>
        </div>

        <div class="gm-section gm-section-bulk">
          <div class="gm-section-head">Bulk Resource</div>
          <div class="gm-row">
            <label class="gm-inline">Who
              <select id="gm-bulk-scope" class="gm-input gm-input-sm">
                <option value="all">All</option>
                <option value="player">Players</option>
                <option value="enemy">Enemies</option>
              </select>
            </label>
            <label class="gm-inline">Stat
              <select id="gm-bulk-res" class="gm-input gm-input-sm">
                <option value="HP">HP</option>
                <option value="MP">MP</option>
                <option value="AP">AP</option>
              </select>
            </label>
          </div>
          <div class="gm-row">
            <label class="gm-inline">Mode
              <select id="gm-bulk-mode" class="gm-input gm-input-sm">
                <option value="full">Full</option>
                <option value="set">Set</option>
                <option value="delta">±Delta</option>
                <option value="pct">% of Max</option>
              </select>
            </label>
            <input type="number" id="gm-bulk-amount" class="gm-input gm-input-sm" value="0" title="Amount (used by Set / Delta / Pct)">
            <button class="btn btn-sm" id="gm-bulk-apply">Apply</button>
          </div>
        </div>

        <div class="gm-section gm-section-bulk">
          <div class="gm-section-head">Bulk Status / Terrain</div>
          <div class="gm-row">
            <select id="gm-bulk-status-id" class="gm-input">${statusOptions || '<option value="">(no statuses)</option>'}</select>
            <input type="number" id="gm-bulk-status-dur" class="gm-input gm-input-sm" value="3" min="1" max="99" title="Duration">
          </div>
          <div class="gm-row">
            <label class="gm-inline">Who
              <select id="gm-bulk-status-scope" class="gm-input gm-input-sm">
                <option value="all">All</option>
                <option value="player">Players</option>
                <option value="enemy">Enemies</option>
              </select>
            </label>
            <button class="btn btn-sm" id="gm-bulk-status-apply">Apply Status</button>
            <button class="btn btn-sm" id="gm-bulk-cleanse">Cleanse</button>
          </div>
          <div class="gm-row">
            <select id="gm-bulk-terrain-id" class="gm-input">${terrainOptions}</select>
            <select id="gm-bulk-terrain-mode" class="gm-input gm-input-sm">
              <option value="empty">Empty Cells</option>
              <option value="all">All Cells</option>
            </select>
            <button class="btn btn-sm" id="gm-bulk-terrain-apply">Paint</button>
          </div>
        </div>

        <div class="gm-section gm-section-flow">
          <div class="gm-section-head">Battle Flow</div>
          <div class="gm-row gm-grid-2">
            <button class="btn btn-sm" id="gm-skip-turn">Skip Turn</button>
            <button class="btn btn-sm" id="gm-end-victory">End: Victory</button>
            <button class="btn btn-sm btn-danger" id="gm-end-defeat">End: Defeat</button>
            <button class="btn btn-sm" id="gm-cancel">Cancel Tool</button>
          </div>
        </div>
      </div>
    `;

    _syncToolButtons();
  }

  function _bind() {
    if (!_root) return;

    _root.querySelectorAll('.gm-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.tool;
        if (_tool === next) {
          cancelTool();
        } else {
          _activateTool(next);
        }
      });
    });

    _root.querySelector('#gm-bulk-apply')?.addEventListener('click', () => {
      const scope = _root.querySelector('#gm-bulk-scope').value;
      const res = _root.querySelector('#gm-bulk-res').value;
      const mode = _root.querySelector('#gm-bulk-mode').value;
      const amt = Number(_root.querySelector('#gm-bulk-amount').value || 0);
      CM().gmBulkAdjust(scope, res, amt, mode);
      _refreshFn?.();
    });

    _root.querySelector('#gm-bulk-status-apply')?.addEventListener('click', () => {
      const scope = _root.querySelector('#gm-bulk-status-scope').value;
      const sid = _root.querySelector('#gm-bulk-status-id').value;
      const dur = Number(_root.querySelector('#gm-bulk-status-dur').value || 3);
      if (!sid) return;
      CM().gmBulkStatus(scope, sid, dur);
      _refreshFn?.();
    });

    _root.querySelector('#gm-bulk-cleanse')?.addEventListener('click', () => {
      const scope = _root.querySelector('#gm-bulk-status-scope').value;
      CM().gmBulkCleanse(scope);
      _refreshFn?.();
    });

    _root.querySelector('#gm-bulk-terrain-apply')?.addEventListener('click', () => {
      const t = _root.querySelector('#gm-bulk-terrain-id').value;
      const mode = _root.querySelector('#gm-bulk-terrain-mode').value;
      CM().gmBulkTerrain(t, mode);
      _refreshFn?.();
    });

    _root.querySelector('#gm-weather-apply')?.addEventListener('click', () => {
      const WX = window.CJS.Weather;
      const cm = CM();
      if (!WX || !cm?.getState) return;
      const state = cm.getState();
      if (!state) return;
      const id = _root.querySelector('#gm-weather-id').value || 'normal';
      const dur = Number(_root.querySelector('#gm-weather-duration').value || 4);
      WX.setEnvironment(state, id, dur, null);
      for (const u of Object.values(state.units || {})) WX.applyStatModsToUnit(u, state);
      cm.notify?.();
      _refreshFn?.();
    });

    _root.querySelector('#gm-weather-clear')?.addEventListener('click', () => {
      const WX = window.CJS.Weather;
      const cm = CM();
      if (!WX || !cm?.getState) return;
      const state = cm.getState();
      if (!state) return;
      WX.clearEnvironment(state);
      for (const u of Object.values(state.units || {})) WX.applyStatModsToUnit(u, state);
      cm.notify?.();
      _refreshFn?.();
    });

    _root.querySelector('#gm-skip-turn')?.addEventListener('click', () => {
      CM().gmSkipTurn();
      CM().runUntilInput();
      _refreshFn?.();
    });

    _root.querySelector('#gm-end-victory')?.addEventListener('click', () => {
      if (!confirm('Force VICTORY (player wins)?')) return;
      CM().gmEndBattle('player');
      _refreshFn?.();
    });

    _root.querySelector('#gm-end-defeat')?.addEventListener('click', () => {
      if (!confirm('Force DEFEAT (enemy wins)?')) return;
      CM().gmEndBattle('enemy');
      _refreshFn?.();
    });

    _root.querySelector('#gm-cancel')?.addEventListener('click', cancelTool);
  }

  // ── TOOL ACTIVATION ───────────────────────────────────────────────
  function _activateTool(tool) {
    _tool = tool;
    _toolCtx = {};
    _movingUnitId = null;

    if (tool === 'place') {
      _toolCtx.monsterId = _root.querySelector('#gm-spawn-id')?.value;
      _toolCtx.team = _root.querySelector('#gm-spawn-team')?.value || 'enemy';
      _toolCtx.size = _root.querySelector('#gm-spawn-size')?.value || '1x1';
      if (!_toolCtx.monsterId) { cancelTool(); return; }
      _hintFn?.(`GM Spawn: click a cell to place "${_toolCtx.monsterId}" (${_toolCtx.team}). Esc to cancel.`);
      _highlightEmptyCells();
    } else if (tool === 'move') {
      _hintFn?.('GM Move: click a unit, then click a destination cell. Esc to cancel.');
      _highlightAllUnits();
    } else if (tool === 'remove') {
      _hintFn?.('GM Remove: click a unit to delete it from the battle. Esc to cancel.');
      _highlightAllUnits();
    } else if (tool === 'damage') {
      _hintFn?.('GM Damage: click a unit, you will be prompted for an amount. Esc to cancel.');
      _highlightAllUnits();
    } else if (tool === 'heal') {
      _hintFn?.('GM Heal: click a unit, you will be prompted for an amount. Esc to cancel.');
      _highlightAllUnits();
    } else if (tool === 'status') {
      _toolCtx.statusId = _root.querySelector('#gm-status-id')?.value;
      _toolCtx.duration = Number(_root.querySelector('#gm-status-duration')?.value || 3);
      if (!_toolCtx.statusId) { cancelTool(); return; }
      _hintFn?.(`GM Status: click a unit to apply "${_toolCtx.statusId}" (${_toolCtx.duration}t). Esc to cancel.`);
      _highlightAllUnits();
    } else if (tool === 'cleanse') {
      _hintFn?.('GM Cleanse: click a unit to remove all statuses. Esc to cancel.');
      _highlightAllUnits();
    } else if (tool === 'terrain') {
      _toolCtx.terrainType = _root.querySelector('#gm-terrain-id')?.value;
      if (!_toolCtx.terrainType) { cancelTool(); return; }
      _hintFn?.(`GM Terrain: click any cell to paint "${_toolCtx.terrainType}". Esc to cancel.`);
      _highlightAllCells();
    } else if (tool === 'inspect') {
      _hintFn?.('GM Inspect: click a unit to view its stats. Esc to cancel.');
      _highlightAllUnits();
    }

    _syncToolButtons();
  }

  function _syncToolButtons() {
    if (!_root) return;
    _root.querySelectorAll('.gm-tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === _tool);
    });
  }

  // ── CLICK HANDLERS ────────────────────────────────────────────────
  function _onPlaceClick(r, c) {
    const result = CM().gmAddUnit(_toolCtx.monsterId, r, c, {
      team: _toolCtx.team,
      size: _toolCtx.size
    });
    if (!result.success) {
      _hintFn?.(`Spawn failed: ${result.reason}. Pick a different cell.`);
      return true;
    }
    cancelTool();
    _refreshFn?.();
    return true;
  }

  function _onMoveClick(r, c) {
    if (!_movingUnitId) {
      const target = GE().getUnitAt(r, c);
      if (!target) {
        _hintFn?.('Click a unit first to pick it up.');
        return true;
      }
      _movingUnitId = target.instanceId;
      _hintFn?.(`Moving ${target.name || _movingUnitId}: click a destination cell.`);
      _highlightEmptyCells();
      return true;
    }
    const result = CM().gmMoveUnit(_movingUnitId, r, c);
    if (!result.success) {
      _hintFn?.(`Move failed: ${result.reason}. Click another cell.`);
      return true;
    }
    cancelTool();
    _refreshFn?.();
    return true;
  }

  function _onRemoveClick(r, c) {
    const target = GE().getUnitAt(r, c);
    if (!target) return true;
    if (!confirm(`Remove ${target.name || target.instanceId} from the battle?`)) return true;
    CM().gmRemoveUnit(target.instanceId);
    cancelTool();
    _refreshFn?.();
    return true;
  }

  function _onDamageClick(r, c) {
    const target = GE().getUnitAt(r, c);
    if (!target) return true;
    const input = window.prompt(`Damage ${target.name || target.instanceId} by how much? (HP ${target.currentHP}/${target.maxHP})`, '10');
    if (input === null) return true;
    const n = Number(input);
    if (!Number.isFinite(n) || n <= 0) return true;
    CM().gmAdjustResource(target, 'HP', -n, 'delta');
    cancelTool();
    _refreshFn?.();
    return true;
  }

  function _onHealClick(r, c) {
    const target = GE().getUnitAt(r, c);
    if (!target) return true;
    const input = window.prompt(`Heal ${target.name || target.instanceId} by how much? (HP ${target.currentHP}/${target.maxHP}, blank = full)`, '');
    if (input === null) return true;
    if (input.trim() === '') {
      CM().gmAdjustResource(target, 'HP', 0, 'full');
    } else {
      const n = Number(input);
      if (!Number.isFinite(n) || n <= 0) return true;
      CM().gmAdjustResource(target, 'HP', n, 'delta');
    }
    cancelTool();
    _refreshFn?.();
    return true;
  }

  function _onStatusClick(r, c) {
    const target = GE().getUnitAt(r, c);
    if (!target) return true;
    CM().gmApplyStatus(target, _toolCtx.statusId, _toolCtx.duration);
    cancelTool();
    _refreshFn?.();
    return true;
  }

  function _onCleanseClick(r, c) {
    const target = GE().getUnitAt(r, c);
    if (!target) return true;
    CM().gmCleanseUnit(target);
    cancelTool();
    _refreshFn?.();
    return true;
  }

  function _onTerrainClick(r, c) {
    CM().gmSetTerrain(r, c, _toolCtx.terrainType);
    // Stay in tool mode for rapid painting; user hits Esc/Cancel to exit.
    _refreshFn?.();
    return true;
  }

  function _onInspectClick(r, c) {
    const target = GE().getUnitAt(r, c);
    if (!target) return true;
    const stats = target.compiledStats || target.stats || {};
    const sList = (target.activeStatuses || []).map(s => `${s.statusId}(${s.duration}t ×${s.stacks})`).join(', ') || 'none';
    const msg = [
      `${target.name || target.instanceId} [${target.team}]`,
      `HP ${target.currentHP}/${target.maxHP}   MP ${target.currentMP || 0}/${target.maxMP || 0}`,
      `AP this turn: ${target.turnState?.apRemaining || 0}`,
      `Move ${target.movement || '?'}   Size ${target.size || '1x1'}   Pos [${target.pos?.[0]},${target.pos?.[1]}]`,
      `Stats: ` + ['S','P','E','C','I','A','L'].map(s => `${s}${stats[s]||0}`).join(' '),
      `DR: phys ${target.dr?.physical||0} / mag ${target.dr?.magic||0} / chaos ${target.dr?.chaos||0}`,
      `Statuses: ${sList}`
    ].join('\n');
    alert(msg);
    cancelTool();
    return true;
  }

  // ── HIGHLIGHT HELPERS ─────────────────────────────────────────────
  function _highlightEmptyCells() {
    GR()?.clearHighlights('gm');
    const cells = (GE().getEmptyCells() || []).map(([r, c]) => ({ r, c }));
    GR()?.setHighlights(cells, 'rgba(34,197,94,0.32)', 'gm');
  }

  function _highlightAllUnits() {
    GR()?.clearHighlights('gm');
    const units = GE().getAllUnits() || [];
    const cells = units.map(u => ({ r: u.pos[0], c: u.pos[1] }));
    GR()?.setHighlights(cells, 'rgba(251,191,36,0.34)', 'gm');
  }

  function _highlightAllCells() {
    GR()?.clearHighlights('gm');
    const dims = GE().getDims();
    const cells = [];
    for (let r = 0; r < dims.height; r++) {
      for (let c = 0; c < dims.width; c++) cells.push({ r, c });
    }
    GR()?.setHighlights(cells, 'rgba(168,85,247,0.20)', 'gm');
  }

  // ── STATUS LIST ───────────────────────────────────────────────────
  function _statusList() {
    // Built-in statuses from StatusManager + any authored ones in DataStore.
    const seen = new Set();
    const out = [];

    const authored = DS().getAllAsArray('statuses') || [];
    for (const s of authored) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ id: s.id, name: s.name || s.id, icon: s.icon || '' });
    }

    // Fall back to the common keys baked into StatusManager._BUILTIN_STATUSES.
    const builtins = [
      'burn', 'poison', 'bleed', 'stun', 'freeze', 'sleep',
      'silence', 'blind', 'confuse', 'fear', 'charm', 'taunt',
      'regen', 'shield', 'haste', 'berserk', 'slow', 'root',
      'doom', 'petrify'
    ];
    for (const id of builtins) {
      if (seen.has(id)) continue;
      const def = SM()?.getStatusDef ? SM().getStatusDef(id) : null;
      seen.add(id);
      out.push({ id, name: def?.name || id, icon: def?.icon || '' });
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  function _esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  return Object.freeze({
    mount, unmount, refresh,
    isToolActive, getActiveTool,
    handleCellClick, cancelTool
  });
})();
