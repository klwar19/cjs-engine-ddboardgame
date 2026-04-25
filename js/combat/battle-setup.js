// battle-setup.js
// Pre-combat setup screen for quick random battles and premade map launches.

window.CJS = window.CJS || {};

window.CJS.BattleSetup = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const MG = () => window.CJS.MapGenerator;
  const C = () => window.CJS.CONST;
  const CM = () => window.CJS.ContentManager;

  let _container = null;
  let _onStart = null;

  let _mode = 'quick';
  let _selectedParty = [];
  let _selectedMonsters = [];
  let _selectedTheme = 'random';
  let _mapSize = 8;
  let _generatedMap = null;
  let _selectedEncounterId = null;
  let _selectPlacements = {};
  let _activePlacementId = null;
  let _placementKey = '';

  function init(containerEl, onStart) {
    _container = containerEl;
    _onStart = onStart;
    _render();
  }

  function show() {
    if (!_container) return;
    _container.style.display = '';
    _render();
  }

  function hide() {
    if (_container) _container.style.display = 'none';
  }

  function reset() {
    _mode = 'quick';
    _selectedParty = [];
    _selectedMonsters = [];
    _selectedTheme = 'random';
    _mapSize = 8;
    _generatedMap = null;
    _selectedEncounterId = null;
    _selectPlacements = {};
    _activePlacementId = null;
    _placementKey = '';
    _render();
  }

  function _render() {
    if (!_container) return;

    const selectContext = _mode === 'select' ? _syncSelectPlacements() : null;
    _container.innerHTML = `
      <div class="setup-screen">
        <div class="setup-header">
          <h2>Battle Setup</h2>
          <div class="setup-mode-tabs">
            <button class="setup-tab ${_mode === 'quick' ? 'active' : ''}" data-mode="quick">Quick Battle</button>
            <button class="setup-tab ${_mode === 'select' ? 'active' : ''}" data-mode="select">Select Map</button>
          </div>
        </div>
        <div class="setup-body">
          ${_mode === 'quick' ? _renderQuickMode() : _renderSelectMode(selectContext)}
        </div>
      </div>
    `;

    _bindEvents();
  }

  function _renderQuickMode() {
    const characters = _getCharacters();
    const monsters = _getMonsters();
    const themes = MG().getThemeList();

    return `
      <div class="setup-columns">
        <div class="setup-panel setup-party">
          <h3>Party Members</h3>
          <div class="setup-hint">Select characters for the player side.</div>
          <div class="setup-unit-grid" id="party-grid">
            ${characters.map((character) => _renderPartyCard(character)).join('') || '<div class="setup-empty">No playable characters found. Import data first.</div>'}
          </div>
          <div class="setup-count">Selected: ${_selectedParty.length}</div>
        </div>

        <div class="setup-panel setup-map-opts">
          <h3>Map Settings</h3>

          <div class="setup-field">
            <label class="form-label">Theme</label>
            <select id="theme-select" class="setup-select">
              <option value="random" ${_selectedTheme === 'random' ? 'selected' : ''}>Random Theme</option>
              ${themes.map((theme) => `<option value="${_escAttr(theme.id)}" ${_selectedTheme === theme.id ? 'selected' : ''}>${_escHtml(theme.icon)} ${_escHtml(theme.name)}</option>`).join('')}
            </select>
          </div>

          <div class="setup-field">
            <label class="form-label">Map Size</label>
            <div class="setup-size-btns">
              ${[8, 10, 12].map((size) => `<button class="setup-size-btn ${_mapSize === size ? 'active' : ''}" data-size="${size}">${size}x${size}</button>`).join('')}
            </div>
          </div>

          ${_generatedMap ? _renderGeneratedMapPreview() : ''}

          <div class="setup-actions-row">
            <button class="btn btn-sm" id="btn-preview-map">${_generatedMap ? 'Re-roll Map' : 'Preview Map'}</button>
          </div>
        </div>

        <div class="setup-panel setup-monsters">
          <h3>Monsters</h3>
          <div class="setup-hint">Add one or more monsters. Repeated clicks create duplicates.</div>
          <div class="setup-unit-grid" id="monster-grid">
            ${monsters.map((monster) => _renderMonsterCard(monster)).join('') || '<div class="setup-empty">No monsters found. Import data first.</div>'}
          </div>
          <div class="setup-count">Selected: ${_selectedMonsters.length} monster${_selectedMonsters.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div class="setup-launch">
        <button class="btn btn-primary btn-lg" id="btn-launch-quick" ${_selectedParty.length === 0 || _selectedMonsters.length === 0 ? 'disabled' : ''}>Start Battle</button>
        <span class="setup-launch-hint">${_selectedParty.length === 0 ? 'Select at least one party member.' : (_selectedMonsters.length === 0 ? 'Select at least one monster.' : `${_selectedParty.length} vs ${_selectedMonsters.length} ready.`)}</span>
      </div>
    `;
  }

  function _renderSelectMode(context) {
    const encounters = _getEncounters();
    const characters = _getCharacters();
    const encounter = _selectedEncounterId ? DS().get('encounters', _selectedEncounterId) : null;
    const placedCount = _selectedParty.filter((id) => !!_selectPlacements[id]).length;
    const missingCount = _selectedParty.length - placedCount;

    return `
      <div class="setup-columns">
        <div class="setup-panel setup-party">
          <h3>Party Members</h3>
          <div class="setup-hint">Select the party, then place them inside the highlighted player zone.</div>
          <div class="setup-unit-grid" id="party-grid">
            ${characters.map((character) => _renderPartyCard(character)).join('') || '<div class="setup-empty">No playable characters found.</div>'}
          </div>
          <div class="setup-count">Selected: ${_selectedParty.length}</div>
        </div>

        <div class="setup-panel setup-map-select" style="flex:2">
          <h3>Select Encounter Map</h3>
          <div class="setup-encounter-list" id="encounter-list">
            ${encounters.map((entry) => `
              <div class="setup-enc-card ${_selectedEncounterId === entry.id ? 'selected' : ''}" data-enc="${_escAttr(entry.id)}">
                <div class="enc-card-name">${_escHtml(entry.name || entry.id)}</div>
                <div class="enc-card-meta">${entry.width || 8}x${entry.height || 8} | ${(entry.units || []).length} units</div>
              </div>
            `).join('') || '<div class="setup-empty">No premade encounters found.</div>'}
          </div>

          ${encounter && context ? _renderPlacementEditor(encounter, context, placedCount, missingCount) : '<div class="setup-empty">Select an encounter to preview monster placement and party spawns.</div>'}
        </div>
      </div>

      <div class="setup-launch">
        <button class="btn btn-primary btn-lg" id="btn-launch-select" ${!_selectedEncounterId || _selectedParty.length === 0 || missingCount > 0 ? 'disabled' : ''}>Start Battle</button>
        <span class="setup-launch-hint">${!_selectedEncounterId ? 'Select an encounter map.' : (_selectedParty.length === 0 ? 'Select at least one party member.' : (missingCount > 0 ? `Place ${missingCount} more party member${missingCount === 1 ? '' : 's'}.` : 'Party placement is ready.'))}</span>
      </div>
    `;
  }

  function _renderPartyCard(character) {
    const checked = _selectedParty.includes(character.id);
    return `
      <label class="setup-unit-card ${checked ? 'selected' : ''}" data-id="${_escAttr(character.id)}">
        <input type="checkbox" ${checked ? 'checked' : ''} data-party="${_escAttr(character.id)}">
        <span class="setup-unit-icon">${_escHtml(character.icon || 'P')}</span>
        <span class="setup-unit-name">${_escHtml(character.name || character.id)}</span>
        <span class="setup-unit-rank">${_escHtml(character.rank || 'F')}</span>
      </label>
    `;
  }

  function _renderMonsterCard(monster) {
    const count = _selectedMonsters.filter((id) => id === monster.id).length;
    return `
      <div class="setup-unit-card monster-card ${count > 0 ? 'selected' : ''}" data-id="${_escAttr(monster.id)}">
        <span class="setup-unit-icon">${_escHtml(monster.icon || 'M')}</span>
        <span class="setup-unit-name">${_escHtml(monster.name || monster.id)}</span>
        <span class="setup-unit-rank">${_escHtml(monster.rank || 'F')}</span>
        ${count > 0 ? `<span class="setup-unit-count">x${count}</span>` : ''}
        <div class="monster-controls">
          <button class="mon-btn mon-add" data-mon="${_escAttr(monster.id)}" title="Add">+</button>
          <button class="mon-btn mon-remove" data-mon="${_escAttr(monster.id)}" title="Remove" ${count === 0 ? 'disabled' : ''}>-</button>
        </div>
      </div>
    `;
  }

  function _renderGeneratedMapPreview() {
    const preview = _generatedMap;
    const cellSize = Math.min(32, Math.floor(400 / Math.max(preview.width, preview.height)));
    let cells = '';

    for (let r = 0; r < preview.height; r++) {
      for (let c = 0; c < preview.width; c++) {
        const terrainId = preview.grid[r][c];
        const terrain = C().TERRAIN_TYPES[terrainId] || C().TERRAIN_TYPES.empty;
        const isPlayerSpawn = preview.spawnZones.player.some(([sr, sc]) => sr === r && sc === c);
        const isEnemySpawn = preview.spawnZones.enemy.some(([sr, sc]) => sr === r && sc === c);
        const spawnClass = isPlayerSpawn ? 'spawn-player' : (isEnemySpawn ? 'spawn-enemy' : '');
        cells += `<div class="preview-cell ${spawnClass}" style="width:${cellSize}px;height:${cellSize}px;background:${_escAttr(terrain.color || '#1a1a2e')}" title="${_escAttr(`${terrainId} [${r},${c}]`)}">${_escHtml(terrain.icon || '')}</div>`;
      }
    }

    return `
      <div class="map-preview">
        <div class="preview-label">${_escHtml(preview.themeIcon)} ${_escHtml(preview.themeName)} (${preview.width}x${preview.height})</div>
        <div class="preview-grid" style="grid-template-columns:repeat(${preview.width}, ${cellSize}px)">${cells}</div>
        <div class="preview-legend">
          <span class="legend-dot spawn-player-dot"></span> Player spawn
          <span class="legend-dot spawn-enemy-dot"></span> Enemy spawn
        </div>
      </div>
    `;
  }

  function _renderPlacementEditor(encounter, context, placedCount, missingCount) {
    const cellSize = Math.min(30, Math.floor(420 / Math.max(context.width, context.height)));
    const occupancy = _buildPreviewOccupancy(context);
    let cells = '';

    for (let r = 0; r < context.height; r++) {
      for (let c = 0; c < context.width; c++) {
        const key = `${r},${c}`;
        const terrainId = context.grid[r]?.[c] || 'empty';
        const terrain = C().TERRAIN_TYPES[terrainId] || C().TERRAIN_TYPES.empty;
        const occupied = occupancy[key] || null;
        const canUseCell = _isBandCell(context, r, c) && terrain.passable && !context.enemyOccupied.has(key);
        const activeCanPlace = _activePlacementId && _canPlacePartyAt(context, _activePlacementId, [r, c], _selectPlacements);
        const classes = ['preview-cell'];

        if (canUseCell) classes.push('spawn-player');
        if (activeCanPlace) classes.push('placement-valid');
        if (occupied?.team === 'enemy') classes.push('preview-enemy-cell');
        if (occupied?.team === 'player') classes.push('preview-party-cell');
        if (occupied?.anchor && occupied.partyId === _activePlacementId) classes.push('placement-current');

        let inner = _escHtml(terrain.icon || '');
        if (occupied?.anchor) {
          inner = `<span class="preview-unit ${occupied.team === 'player' ? 'pu' : 'eu'}">${_escHtml(occupied.icon || (occupied.team === 'player' ? 'P' : 'E'))}</span>`;
        } else if (occupied?.team === 'player') {
          inner = '<span class="preview-body player"></span>';
        } else if (occupied?.team === 'enemy') {
          inner = '<span class="preview-body enemy"></span>';
        }

        cells += `<div class="${classes.join(' ')}" style="width:${cellSize}px;height:${cellSize}px;background:${_escAttr(terrain.color || '#1a1a2e')}" title="${_escAttr(`${terrainId} [${r},${c}]`)}" ${canUseCell ? `data-place-row="${r}" data-place-col="${c}"` : ''}>${inner}</div>`;
      }
    }

    return `
      <div class="placement-header">
        <div>
          <div class="preview-label">${_escHtml(encounter.name || encounter.id)} (${context.width}x${context.height})</div>
          <div class="setup-hint">Enemy placements stay fixed. Click a party chip, then click a highlighted cell to move that member.</div>
        </div>
        <div class="placement-summary">${placedCount}/${_selectedParty.length} placed${missingCount > 0 ? ` | ${missingCount} missing` : ''}</div>
      </div>

      <div class="placement-roster">
        ${_selectedParty.map((id) => _renderPlacementChip(id)).join('') || '<div class="setup-empty">Select party members to place them.</div>'}
      </div>

      <div class="placement-actions">
        <button class="btn btn-sm" id="btn-auto-fill-party" ${_selectedParty.length === 0 ? 'disabled' : ''}>Auto Fill</button>
        <button class="btn btn-sm" id="btn-clear-active-party" ${!_activePlacementId || !_selectPlacements[_activePlacementId] ? 'disabled' : ''}>Clear Active Placement</button>
      </div>

      <div class="map-preview interactive">
        <div class="preview-grid placement-grid" style="grid-template-columns:repeat(${context.width}, ${cellSize}px)">${cells}</div>
        <div class="preview-legend">
          <span class="legend-dot spawn-player-dot"></span> Player zone
          <span class="legend-dot spawn-enemy-dot"></span> Enemy footprint
        </div>
      </div>
    `;
  }

  function _renderPlacementChip(id) {
    const character = DS().get('characters', id);
    const assigned = _selectPlacements[id];
    const classes = ['placement-chip'];
    if (_activePlacementId === id) classes.push('active');
    if (assigned) classes.push('placed');
    return `
      <button class="${classes.join(' ')}" data-pick-party="${_escAttr(id)}" title="${assigned ? `Placed at ${assigned[0]},${assigned[1]}` : 'Not placed yet'}">
        <span class="placement-chip-icon">${_escHtml(character?.icon || 'P')}</span>
        <span class="placement-chip-name">${_escHtml(character?.name || id)}</span>
        <span class="placement-chip-meta">${assigned ? _escHtml(`[${assigned[0]},${assigned[1]}]`) : 'unplaced'}</span>
      </button>
    `;
  }

  function _bindEvents() {
    _container.querySelectorAll('.setup-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        _mode = tab.dataset.mode;
        _render();
      });
    });

    _container.querySelectorAll('[data-party]').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const id = event.target.dataset.party;
        if (event.target.checked) {
          if (!_selectedParty.includes(id)) _selectedParty.push(id);
        } else {
          _selectedParty = _selectedParty.filter((value) => value !== id);
          delete _selectPlacements[id];
          if (_activePlacementId === id) _activePlacementId = null;
        }
        _placementKey = '';
        _render();
      });
    });

    _container.querySelectorAll('.mon-add').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        _selectedMonsters.push(button.dataset.mon);
        _render();
      });
    });

    _container.querySelectorAll('.mon-remove').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const index = _selectedMonsters.lastIndexOf(button.dataset.mon);
        if (index >= 0) _selectedMonsters.splice(index, 1);
        _render();
      });
    });

    const themeSelect = _container.querySelector('#theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', () => {
        _selectedTheme = themeSelect.value;
        _generatedMap = null;
        _render();
      });
    }

    _container.querySelectorAll('.setup-size-btn').forEach((button) => {
      button.addEventListener('click', () => {
        _mapSize = parseInt(button.dataset.size, 10);
        _generatedMap = null;
        _render();
      });
    });

    const previewButton = _container.querySelector('#btn-preview-map');
    if (previewButton) {
      previewButton.addEventListener('click', () => {
        const theme = _selectedTheme === 'random' ? undefined : _selectedTheme;
        _generatedMap = MG().generate({ theme, width: _mapSize, height: _mapSize });
        _render();
      });
    }

    _container.querySelectorAll('.setup-enc-card').forEach((card) => {
      card.addEventListener('click', () => {
        _selectedEncounterId = card.dataset.enc;
        _placementKey = '';
        _activePlacementId = null;
        _render();
      });
    });

    _container.querySelectorAll('[data-pick-party]').forEach((button) => {
      button.addEventListener('click', () => {
        _activePlacementId = button.dataset.pickParty;
        _render();
      });
    });

    const autoFillButton = _container.querySelector('#btn-auto-fill-party');
    if (autoFillButton) {
      autoFillButton.addEventListener('click', () => {
        _selectPlacements = {};
        _placementKey = '';
        _syncSelectPlacements(true);
        _render();
      });
    }

    const clearActiveButton = _container.querySelector('#btn-clear-active-party');
    if (clearActiveButton) {
      clearActiveButton.addEventListener('click', () => {
        if (_activePlacementId) delete _selectPlacements[_activePlacementId];
        _render();
      });
    }

    _container.querySelectorAll('[data-place-row]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const row = parseInt(cell.dataset.placeRow, 10);
        const col = parseInt(cell.dataset.placeCol, 10);
        const anchorPartyId = _findPartyAnchorAt(row, col);
        if (anchorPartyId) {
          _activePlacementId = anchorPartyId;
          _render();
          return;
        }

        if (!_activePlacementId) {
          _activePlacementId = _selectedParty[0] || null;
        }
        if (!_activePlacementId) return;

        const context = _buildPlacementContext(DS().get('encounters', _selectedEncounterId));
        if (!context) return;
        if (!_canPlacePartyAt(context, _activePlacementId, [row, col], _selectPlacements)) return;

        _selectPlacements[_activePlacementId] = [row, col];
        _activePlacementId = _selectedParty.find((id) => !_selectPlacements[id]) || _activePlacementId;
        _render();
      });
    });

    const launchQuick = _container.querySelector('#btn-launch-quick');
    if (launchQuick) launchQuick.addEventListener('click', _launchQuickBattle);

    const launchSelect = _container.querySelector('#btn-launch-select');
    if (launchSelect) launchSelect.addEventListener('click', _launchSelectBattle);
  }

  function _launchQuickBattle() {
    if (_selectedParty.length === 0 || _selectedMonsters.length === 0) return;

    if (!_generatedMap) {
      const theme = _selectedTheme === 'random' ? undefined : _selectedTheme;
      _generatedMap = MG().generate({ theme, width: _mapSize, height: _mapSize });
    }

    const unitData = {};
    for (const id of _selectedParty) {
      unitData[id] = DS().get('characters', id);
    }
    for (const id of _selectedMonsters) {
      if (!unitData[id]) unitData[id] = DS().get('monsters', id);
    }

    const playerPlacements = MG().placeUnitsInZone(_selectedParty, _generatedMap.spawnZones.player, unitData, _generatedMap.grid);
    const enemyPlacements = MG().placeUnitsInZone(_selectedMonsters, _generatedMap.spawnZones.enemy, unitData, _generatedMap.grid);
    const encounterId = `_quick_battle_${Date.now()}`;

    DS().replace('encounters', encounterId, {
      id: encounterId,
      name: `Quick Battle (${_generatedMap.themeName})`,
      width: _generatedMap.width,
      height: _generatedMap.height,
      grid: _generatedMap.grid,
      units: [...playerPlacements, ...enemyPlacements],
      _scope: 'runtime',
      _world: null,
      _origin: 'runtime:battle-setup',
      _runtime: true
    });

    if (_onStart) _onStart(encounterId);
  }

  function _launchSelectBattle() {
    if (!_selectedEncounterId || _selectedParty.length === 0) return;

    const encounter = DS().get('encounters', _selectedEncounterId);
    const context = _syncSelectPlacements();
    if (!encounter || !context) return;

    const missing = _selectedParty.filter((id) => !_selectPlacements[id]);
    if (missing.length > 0) {
      alert(`Place all party members before starting. Missing: ${missing.join(', ')}`);
      return;
    }

    const fixedEnemyUnits = context.fixedEnemyUnits.map(({ placement, record }) => ({
      id: placement.id,
      pos: [...placement.pos],
      size: placement.size || record?.size || '1x1'
    }));

    const playerPlacements = _selectedParty
      .filter((id) => !!_selectPlacements[id])
      .map((id) => ({
        id,
        pos: [..._selectPlacements[id]],
        size: DS().get('characters', id)?.size || '1x1'
      }));

    const encounterId = `_select_battle_${Date.now()}`;
    const grid = encounter.grid ? JSON.parse(JSON.stringify(encounter.grid)) : [];

    DS().replace('encounters', encounterId, {
      id: encounterId,
      name: `${encounter.name || encounter.id} (Custom Party)`,
      width: encounter.width || 8,
      height: encounter.height || 8,
      grid,
      units: [...fixedEnemyUnits, ...playerPlacements],
      _scope: 'runtime',
      _world: null,
      _origin: 'runtime:battle-setup',
      _runtime: true
    });

    if (_onStart) _onStart(encounterId);
  }

  function _syncSelectPlacements(forceAutofill = false) {
    const encounter = _selectedEncounterId ? DS().get('encounters', _selectedEncounterId) : null;
    if (!encounter) {
      _selectPlacements = {};
      _activePlacementId = null;
      _placementKey = '';
      return null;
    }

    const context = _buildPlacementContext(encounter);
    const key = `${_selectedEncounterId}|${_selectedParty.join(',')}`;
    const shouldAutofill = forceAutofill || key !== _placementKey;
    const nextPlacements = {};

    for (const id of _selectedParty) {
      const current = _selectPlacements[id];
      if (current && _canPlacePartyAt(context, id, current, nextPlacements)) {
        nextPlacements[id] = [...current];
      }
    }

    if (shouldAutofill) {
      const preferredAnchors = _getPreferredAnchors(context);
      for (const id of _selectedParty) {
        if (nextPlacements[id]) continue;
        const found = _findFirstFit(context, id, preferredAnchors, nextPlacements);
        if (found) nextPlacements[id] = found;
      }
    }

    _selectPlacements = nextPlacements;
    _placementKey = key;

    if (_activePlacementId && !_selectedParty.includes(_activePlacementId)) {
      _activePlacementId = null;
    }
    if (!_activePlacementId) {
      _activePlacementId = _selectedParty.find((id) => !_selectPlacements[id]) || _selectedParty[0] || null;
    }

    return context;
  }

  function _buildPlacementContext(encounter) {
    if (!encounter) return null;

    const width = encounter.width || 8;
    const height = encounter.height || 8;
    const grid = encounter.grid || Array.from({ length: height }, () => Array(width).fill('empty'));
    const fixedEnemyUnits = [];
    const playerSeedUnits = [];
    const enemyOccupied = new Set();

    for (const placement of encounter.units || []) {
      const unitInfo = _getEncounterUnitInfo(placement.id);
      if (!unitInfo.record) continue;

      const bucket = unitInfo.team === 'player' || unitInfo.team === 'ally'
        ? playerSeedUnits
        : fixedEnemyUnits;

      bucket.push({
        placement: {
          id: placement.id,
          pos: [...placement.pos],
          size: placement.size || unitInfo.record.size || '1x1'
        },
        record: unitInfo.record,
        team: unitInfo.team
      });

      if (bucket === fixedEnemyUnits) {
        _forEachFootprintCell(placement.pos, placement.size || unitInfo.record.size || '1x1', (r, c) => {
          enemyOccupied.add(`${r},${c}`);
        });
      }
    }

    const band = _computeSpawnBand(height, playerSeedUnits);
    return {
      width,
      height,
      grid,
      fixedEnemyUnits,
      playerSeedUnits,
      enemyOccupied,
      bandStart: band.start,
      bandEnd: band.end
    };
  }

  function _computeSpawnBand(height, playerSeedUnits) {
    if (playerSeedUnits.length === 0) {
      return { start: Math.max(0, height - 2), end: height - 1 };
    }

    let minRow = height - 1;
    let maxRow = 0;

    for (const { placement, record } of playerSeedUnits) {
      const size = C().UNIT_SIZES[placement.size || record?.size || '1x1'] || { w: 1, h: 1 };
      minRow = Math.min(minRow, placement.pos[0]);
      maxRow = Math.max(maxRow, placement.pos[0] + size.h - 1);
    }

    return {
      start: Math.max(0, minRow - 1),
      end: Math.min(height - 1, maxRow + 1)
    };
  }

  function _getPreferredAnchors(context) {
    const ordered = [];
    const seen = new Set();

    for (const { placement } of context.playerSeedUnits) {
      const key = `${placement.pos[0]},${placement.pos[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push([...placement.pos]);
      }
    }

    for (let r = context.bandStart; r <= context.bandEnd; r++) {
      for (let c = 0; c < context.width; c++) {
        const key = `${r},${c}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push([r, c]);
      }
    }

    return ordered;
  }

  function _findFirstFit(context, partyId, anchors, placements) {
    for (const anchor of anchors) {
      if (_canPlacePartyAt(context, partyId, anchor, placements)) {
        return [...anchor];
      }
    }
    return null;
  }

  function _canPlacePartyAt(context, partyId, anchor, placements) {
    const record = DS().get('characters', partyId);
    if (!record || !Array.isArray(anchor)) return false;

    const occupiedByParty = _buildPartyOccupiedSet(placements, partyId);
    let valid = true;

    _forEachFootprintCell(anchor, record.size || '1x1', (r, c) => {
      if (!valid) return;
      if (r < 0 || r >= context.height || c < 0 || c >= context.width) {
        valid = false;
        return;
      }

      const terrainId = context.grid[r]?.[c] || 'empty';
      const terrain = C().TERRAIN_TYPES[terrainId];
      if (terrain && !terrain.passable) {
        valid = false;
        return;
      }

      if (!_isBandCell(context, r, c)) {
        valid = false;
        return;
      }

      const key = `${r},${c}`;
      if (context.enemyOccupied.has(key) || occupiedByParty.has(key)) {
        valid = false;
      }
    });

    return valid;
  }

  function _buildPartyOccupiedSet(placements, ignoreId) {
    const occupied = new Set();
    for (const [id, anchor] of Object.entries(placements || {})) {
      if (id === ignoreId || !Array.isArray(anchor)) continue;
      const record = DS().get('characters', id);
      if (!record) continue;
      _forEachFootprintCell(anchor, record.size || '1x1', (r, c) => {
        occupied.add(`${r},${c}`);
      });
    }
    return occupied;
  }

  function _buildPreviewOccupancy(context) {
    const occupancy = Object.create(null);

    for (const { placement, record } of context.fixedEnemyUnits) {
      _markPreviewUnit(occupancy, placement, record, 'enemy', null);
    }

    for (const id of _selectedParty) {
      const anchor = _selectPlacements[id];
      const record = DS().get('characters', id);
      if (!anchor || !record) continue;
      _markPreviewUnit(occupancy, { id, pos: anchor, size: record.size || '1x1' }, record, 'player', id);
    }

    return occupancy;
  }

  function _markPreviewUnit(occupancy, placement, record, team, partyId) {
    _forEachFootprintCell(placement.pos, placement.size || record?.size || '1x1', (r, c, isAnchor) => {
      occupancy[`${r},${c}`] = {
        team,
        partyId,
        anchor: isAnchor,
        icon: record?.icon || (team === 'player' ? 'P' : 'E')
      };
    });
  }

  function _findPartyAnchorAt(row, col) {
    for (const [id, anchor] of Object.entries(_selectPlacements)) {
      if (anchor && anchor[0] === row && anchor[1] === col) return id;
    }
    return null;
  }

  function _isBandCell(context, row, col) {
    return row >= context.bandStart && row <= context.bandEnd && col >= 0 && col < context.width;
  }

  function _forEachFootprintCell(anchor, size, callback) {
    const [baseRow, baseCol] = anchor;
    const footprint = C().UNIT_SIZES[size || '1x1'] || { w: 1, h: 1 };
    for (let dr = 0; dr < footprint.h; dr++) {
      for (let dc = 0; dc < footprint.w; dc++) {
        callback(baseRow + dr, baseCol + dc, dr === 0 && dc === 0);
      }
    }
  }

  function _getCharacters() {
    const items = CM()?.getVisibleItems?.('characters') || DS().getAllAsArray('characters');
    return items
      .filter((character) => character && character.team !== 'enemy')
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  }

  function _getMonsters() {
    const items = CM()?.getVisibleItems?.('monsters') || DS().getAllAsArray('monsters');
    return items.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  }

  function _getEncounters() {
    const items = CM()?.getVisibleItems?.('encounters') || DS().getAllAsArray('encounters');
    return items
      .filter((encounter) => !encounter?._runtime && encounter?._scope !== 'runtime')
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  }

  function _getEncounterUnitInfo(id) {
    const character = DS().get('characters', id);
    if (character) {
      return {
        record: character,
        team: character.team === 'enemy' ? 'enemy' : (character.team || 'player')
      };
    }

    const monster = DS().get('monsters', id);
    if (monster) {
      return {
        record: monster,
        team: monster.team || 'enemy'
      };
    }

    return { record: null, team: 'enemy' };
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

  return Object.freeze({
    init,
    show,
    hide,
    reset
  });
})();
