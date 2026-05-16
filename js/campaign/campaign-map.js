// campaign-map.js
// Node-map renderer for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignMap = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Runner = () => window.CJS.ScenarioRunner;

  function render(container) {
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const map = CS().getActiveMap();
    if (!container) return;

    if (!run || !map) {
      container.innerHTML = '<div class="campaign-empty">No active scenario map.</div>';
      return;
    }

    if (run.travelMode === 'grid_map' || map.type === 'grid_map') {
      renderGrid(container, state, run, map);
      return;
    }

    const mapState = state.mapState[map.id] || { revealed: {}, visited: {}, locked: {}, cleared: {} };
    const layers = _layers(map);
    const currentNode = Runner().findCurrentNode();
    const activeLayer = run.mapLayer || _nodeLayer(currentNode) || layers[0]?.id || 'layer_1';
    const revealedNodes = (map.nodes || []).filter((node) =>
      node.discoveredByDefault || mapState.revealed?.[node.id] || run.revealedNodes?.includes(node.id));
    const nodes = layers.length > 1
      ? revealedNodes.filter((node) => _nodeLayer(node) === activeLayer)
      : revealedNodes;
    const width = 680;
    const height = 420;
    const nodeById = Object.fromEntries((map.nodes || []).map((node) => [node.id, node]));

    const lines = [];
    for (const node of nodes) {
      for (const exit of node.exits || []) {
        const target = nodeById[exit.to];
        if (!target) continue;
        if (!nodes.some((entry) => entry.id === target.id)) continue;
        lines.push(`<line x1="${node.x}" y1="${node.y}" x2="${target.x}" y2="${target.y}" class="campaign-map-link" />`);
      }
    }

    const nodeMarkup = nodes.map((node) => {
      const active = run.currentNode === node.id;
      const visited = mapState.visited?.[node.id] || run.visitedNodes?.includes(node.id);
      const locked = mapState.locked?.[node.id];
      const cleared = mapState.cleared?.[node.id];
      const kind = String(node.kind || 'node').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      const objective = node.questObjective || Runner().objectiveForNode?.(node.id, state, map);
      const objectiveDone = objective && _isObjectiveDone(state, objective);
      const radius = active ? 22 : 18;
      const iconRadius = active ? 13 : 11;
      const iconId = _nodeIconSymbolId(node);
      return `
        <g class="campaign-map-node kind-${_escAttr(kind)} ${active ? 'is-active' : ''} ${visited ? 'is-visited' : ''} ${locked ? 'is-locked' : ''} ${cleared ? 'is-cleared' : ''} ${objective ? (objectiveDone ? 'has-objective is-objective-done' : 'has-objective') : ''}" data-node-id="${_escAttr(node.id)}" tabindex="0">
          <circle cx="${node.x}" cy="${node.y}" r="${radius}"></circle>
          ${objective ? `<circle class="campaign-map-objective-ring" cx="${node.x}" cy="${node.y}" r="${radius + 6}" />` : ''}
          <use href="#${iconId}" x="${node.x - iconRadius}" y="${node.y - iconRadius}" width="${iconRadius * 2}" height="${iconRadius * 2}" class="campaign-map-node-art"/>
          <text class="campaign-map-label" x="${node.x}" y="${node.y + 36}" text-anchor="middle">${_esc(_shortLabel(node.title || node.id))}</text>
          ${objective ? `<text class="campaign-map-objective-label" x="${node.x}" y="${node.y - 26}" text-anchor="middle">${_esc(_objectiveTag(objective))}</text>` : ''}
        </g>
      `;
    }).join('');

    const theme = _mapTheme(map);
    container.innerHTML = `
      <div class="campaign-map-shell">
        <div class="campaign-map-head">
          <div>
            <h2>${_esc(map.name || 'Scenario Map')}</h2>
            <span class="campaign-muted">${_esc(_mapMeta(map, nodes.length, revealedNodes.length))}</span>
          </div>
          ${_renderLayerTabs(layers, activeLayer)}
        </div>
        <svg class="campaign-map-canvas" viewBox="0 0 ${width} ${height}" role="img" aria-label="${_escAttr(map.name || map.id)}" data-theme="${_escAttr(theme)}">
          <defs>${_nodeIconDefs()}</defs>
          <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="campaign-map-bg"></rect>
          ${lines.join('')}
          ${nodeMarkup}
        </svg>
        <div class="campaign-node-detail">
          ${renderNodeDetailSafe(currentNode, mapState)}
        </div>
      </div>
    `;

    container.querySelectorAll('[data-node-id]').forEach((el) => {
      el.addEventListener('click', () => renderSelectedNode(container, el.dataset.nodeId));
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') renderSelectedNode(container, el.dataset.nodeId);
      });
    });
  }

  function renderGrid(container, state, run, map) {
    const activeLevelId = run.mapLayer || null;
    const levels = Array.isArray(map?.levels) ? map.levels : [];
    const activeLevel = levels.find((entry) => _normalizeLayerId(entry.id || entry.layerId || 'level_1') === _normalizeLayerId(activeLevelId || map.defaultLevelId || 'level_1')) || levels[0] || null;
    const width = Number(activeLevel?.width || map.width || map.cols || map.columns || 8);
    const height = Number(activeLevel?.height || map.height || map.rows || 8);
    const mapState = state.mapState[map.id] || {};
    const revealed = mapState.revealedCells || {};
    const visited = mapState.visitedCells || {};
    const current = run.currentCell || { x: 0, y: 0 };
    const cells = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = _cellKey(x, y, activeLevelId, map);
        const cell = Runner().findCell?.(map, x, y, run.mapLayer) || { x, y, kind: _terrainAt(map, x, y), title: key };
        const threat = _movingThreatAt(run, map, x, y, activeLevelId);
        const isCurrent = Number(current.x) === x && Number(current.y) === y;
        const isRevealed = revealed[key] || (run.revealedCells || []).includes(key) || cell.discoveredByDefault || isCurrent;
        const isVisited = visited[key] || (run.visitedCells || []).includes(key);
        const passable = _cellPassable(map, x, y);
        const canMove = isRevealed && passable && _canMoveCell(run, x, y);
        const objective = cell.questObjective || Runner().objectiveForCell?.(cell, state, map);
        const objectiveDone = objective && _isObjectiveDone(state, objective);
        const objectiveTitle = objective
          ? `${objectiveDone ? '✓ ' : '★ '}${objective.label}`
          : '';
        const threatAdjacent = threat ? _isAdjacent(current, threat) : false;
        const kindClass = _gridKindClass(cell);
        const nodeBadgeClass = _gridNodeBadge(cell, objective);
        const threatMarkup = threat ? _threatMarkupV2(threat, threatAdjacent) : '';
        const playerMarkup = isCurrent ? _playerMarkupV2() : '';
        const labelMarkup = isRevealed && cell.title
          ? `<span class="campaign-grid-cell-label">${_esc(_shortLabel(cell.title))}</span>`
          : '';
        cells.push(`
          <button class="campaign-grid-cell v2 kind-${kindClass} ${isCurrent ? 'is-active' : ''} ${isVisited ? 'is-visited' : ''} ${isRevealed ? '' : 'is-hidden'} ${passable ? '' : 'is-blocked'} ${objective ? (objectiveDone ? 'has-objective is-objective-done' : 'has-objective') : ''} ${threat ? 'has-threat' : ''}"
            data-campaign-action="move-cell" data-x="${x}" data-y="${y}" ${canMove || isCurrent ? '' : 'disabled'} title="${_escAttr(_cellTitleText(cell, key, objective, objectiveTitle, threat))}">
            ${nodeBadgeClass && isRevealed ? `<span class="campaign-grid-cell-node ${nodeBadgeClass}" aria-hidden="true"></span>` : ''}
            ${threatMarkup}
            ${playerMarkup}
            ${labelMarkup}
          </button>
        `);
      }
    }
    const currentCell = Runner().findCurrentCell?.() || Runner().findCell?.(map, current.x, current.y, run.mapLayer);
    const theme = _mapTheme(map);
    container.innerHTML = `
      <div class="campaign-map-shell v2">
        <div class="campaign-map-head v2">
          <div>
            <h2>${_esc(map.name || 'Scenario Grid')}</h2>
            <span class="campaign-muted">${_esc(_gridMeta(map, run, width, height))}</span>
            <div class="campaign-map-legend">
              <span style="--legend-color:#86c060"><i></i>Grass / Forest</span>
              <span style="--legend-color:#a07a52"><i></i>Dirt / Mud</span>
              <span style="--legend-color:#c2a981"><i></i>Path / Road</span>
              <span style="--legend-color:#f5fbff"><i></i>Snow</span>
              <span style="--legend-color:#5fa8d0"><i></i>Water</span>
              <span style="--legend-color:#8d959a"><i></i>Stone / Wall</span>
            </div>
          </div>
        </div>
        <div class="campaign-grid-map v2" style="--grid-cols:${width}" data-theme="${_escAttr(theme)}">
          ${cells.join('')}
        </div>
        <div class="campaign-node-detail">
          ${renderGridCellDetailSafe(currentCell, mapState)}
        </div>
      </div>
    `;
  }

  function _gridKindClass(cell = {}) {
    const raw = String(cell.kind || cell.terrain || 'floor').toLowerCase();
    if (raw === 'grass' || raw === 'meadow' || raw === 'field') return 'grass';
    if (raw === 'forest' || raw === 'tree' || raw === 'woods') return 'forest';
    if (raw === 'dirt' || raw === 'mud') return 'dirt';
    if (raw === 'stone' || raw === 'rubble' || raw === 'tile' || raw === 'floor') return 'stone';
    if (raw === 'wall' || raw === 'obstacle' || raw === 'rock' || raw === 'pillar') return 'wall';
    if (raw === 'water' || raw === 'river' || raw === 'pond' || raw === 'lake') return 'water';
    if (raw === 'path' || raw === 'road' || raw === 'lane' || raw === 'patrol') return 'path';
    if (raw === 'snow' || raw === 'ice' || raw === 'frost' || raw === 'frostwood') return 'snow';
    return raw.replace(/[^a-z0-9_-]/g, '_');
  }

  function _gridNodeBadge(cell = {}, objective = null) {
    const kind = String(cell.kind || '').toLowerCase();
    const tags = (cell.tags || []).map((t) => String(t).toLowerCase());
    if (kind === 'boss' || tags.includes('boss')) return 'is-boss';
    if (kind === 'battle' || kind === 'event_battle' || tags.includes('battle')) return 'is-battle';
    if (kind === 'rest' || kind === 'camp' || kind === 'campfire' || tags.includes('rest')) return 'is-rest';
    if (kind === 'shop' || tags.includes('shop')) return 'is-shop';
    if (kind === 'story' || kind === 'event' || tags.includes('story')) return 'is-story';
    if (kind === 'treasure' || kind === 'reward' || kind === 'loot' || tags.includes('treasure')) return 'is-treasure';
    if (kind === 'special_event' || tags.includes('special_event')) return 'is-event';
    if (objective) return 'is-story';
    return '';
  }

  function _playerMarkupV2() {
    return `
      <span class="campaign-grid-player-shadow" aria-hidden="true"></span>
      <span class="campaign-grid-player" aria-label="You are here"></span>
    `;
  }

  function _threatMarkupV2(threat = {}, adjacent = false) {
    const title = _escAttr(`${threat.label || threat.id || 'Threat'} — close to engage`);
    return `<span class="campaign-grid-threat v2 ${adjacent ? 'is-adjacent' : ''}" title="${title}" aria-hidden="true"></span>`;
  }

  function _isAdjacent(current = {}, threat = {}) {
    if (!current || !threat) return false;
    const dx = Math.abs(Number(current.x) - Number(threat.x));
    const dy = Math.abs(Number(current.y) - Number(threat.y));
    return (dx + dy) <= 1;
  }

  function _threatMarkup(threat = {}, adjacent = false) {
    const sprite = _threatSprite(threat);
    const icon = _threatIcon(threat);
    const title = _escAttr(`${threat.label || threat.id || 'Threat'} — close to engage`);
    const cls = `campaign-grid-threat ${adjacent ? 'is-adjacent' : ''}`;
    if (sprite) {
      return `<span class="${cls}" title="${title}" style="background-image:url('${_escAttr(sprite)}');background-size:cover;background-position:center;"></span>`;
    }
    return `<span class="${cls}" title="${title}">${_esc(icon)}</span>`;
  }

  function _threatSprite(threat = {}) {
    if (threat.sprite) return threat.sprite;
    if (threat.portrait) return threat.portrait;
    const monsterIds = _threatMonsterIds(threat);
    for (const id of monsterIds) {
      const record = window.CJS.DataStore?.get?.('monsters', id);
      if (record?.portrait) return record.portrait;
      if (record?.sprite) return record.sprite;
    }
    return '';
  }

  function _threatIcon(threat = {}) {
    if (threat.icon && threat.icon !== '!' && threat.icon !== '?') return threat.icon;
    const monsterIds = _threatMonsterIds(threat);
    for (const id of monsterIds) {
      const record = window.CJS.DataStore?.get?.('monsters', id);
      if (record?.icon) return record.icon;
    }
    return threat.icon || '👹';
  }

  function _threatMonsterIds(threat = {}) {
    const ids = [];
    if (Array.isArray(threat.monsterIds)) ids.push(...threat.monsterIds);
    if (threat.encounterId) {
      const encounter = window.CJS.DataStore?.get?.('encounters', threat.encounterId);
      if (encounter?.units) {
        for (const unit of encounter.units) {
          const id = unit?.id || unit?.monsterId || unit?.baseId;
          if (id) ids.push(id);
        }
      }
    }
    if (threat.battleSetId) {
      const card = window.CJS.CampaignBattleSetForge?.getCard?.(threat.battleSetId)
        || window.CJS.CampaignDataLoader?.getBattleSetCard?.(threat.battleSetId);
      if (Array.isArray(card?.monsterIds)) ids.push(...card.monsterIds);
      if (card?.encounterId) {
        const encounter = window.CJS.DataStore?.get?.('encounters', card.encounterId);
        if (encounter?.units) {
          for (const unit of encounter.units) {
            const id = unit?.id || unit?.monsterId || unit?.baseId;
            if (id) ids.push(id);
          }
        }
      }
    }
    return ids.filter(Boolean);
  }

  function _glyphForCell(cell = {}, opts = {}) {
    if (!opts.passable) {
      return `<span class="campaign-grid-glyph is-blocked">#</span>`;
    }
    if (opts.isCurrent) {
      return `<span class="campaign-grid-glyph is-current">◆</span>`;
    }
    if (opts.objective) {
      return `<span class="campaign-grid-glyph is-objective">${_objectiveIcon(opts.objective)}</span>`;
    }
    return `<span class="campaign-grid-glyph">${_gridIcon(cell, true)}</span>`;
  }

  function _cellTitleText(cell = {}, key = '', objective = null, objectiveTitle = '', threat = null) {
    const base = cell.title || key;
    const parts = [];
    if (objective) parts.push(objectiveTitle);
    parts.push(base);
    if (threat) parts.push(`Threat present: ${threat.label || threat.id || 'roaming enemy'}`);
    return parts.join(' — ');
  }

  function renderGridCellDetail(cell, mapState = {}) {
    if (!cell) return '<div class="campaign-empty">No current cell.</div>';
    const key = _cellKey(cell.x, cell.y, cell.levelId, CS().getActiveMap());
    const tags = (cell.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('');
    const objective = cell.questObjective || Runner().objectiveForCell?.(cell, state, CS().getActiveMap());
    const state = CS().getState();
    const objectiveDone = objective ? _isObjectiveDone(state, objective) : false;
    return `
      <div class="campaign-detail-title">
        <span>${_esc(cell.title || key)}</span>
        <span class="campaign-pill">${_esc(cell.kind || 'floor')}</span>
        ${objective ? `<span class="campaign-pill ${objectiveDone ? 'is-current' : 'is-objective'}" title="${_escAttr(objective.questTitle || '')}">${_objectiveIcon(objective)} ${objectiveDone ? '✓ ' : ''}${_esc(objective.label)}</span>` : ''}
      </div>
      <div class="campaign-muted">${_esc(cell.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      <div class="campaign-node-actions">
        <span class="campaign-pill is-current">Current ${_esc(key)}</span>
        ${cell.levelName ? `<span class="campaign-pill">${_esc(cell.levelName)}</span>` : ''}
        ${cell.nextLevelId ? `<span class="campaign-pill">Leads to ${_esc(cell.nextLevelId.replace(/_/g, ' '))}</span>` : ''}
        ${mapState.clearedCells?.[key] ? '<span class="campaign-pill">Cleared</span>' : ''}
      </div>
    `;
  }

  function renderSelectedNode(container, nodeId) {
    const map = CS().getActiveMap();
    const state = CS().getState();
    const node = Runner().findNode(map, nodeId);
    const detail = container.querySelector('.campaign-node-detail');
    if (detail) detail.innerHTML = renderNodeDetailSafe(node, state.mapState[map.id] || {});
  }

  function renderNodeDetail(node, mapState = {}) {
    if (!node) return '<div class="campaign-empty">Select a node.</div>';
    const run = CS().getState()?.activeScenarioRun;
    const map = CS().getActiveMap();
    const isCurrent = run?.currentNode === node.id;
    const canMove = _canMoveTo(node.id, run, map);
    const captured = mapState.captured?.[node.id];
    const entryResolved = mapState.entryResolved?.[node.id];
    const notes = mapState.notes?.[node.id] || [];
    const exits = (node.exits || []).map((exit) => {
      const target = Runner().findNode(map, exit.to);
      const locked = mapState.locked?.[exit.to] || exit.locked;
      return `
        <button class="campaign-action" data-campaign-action="move-node" data-node-id="${_escAttr(exit.to)}" ${locked || !isCurrent ? 'disabled' : ''}>
          ${_esc(exit.label || target?.title || exit.to)}
        </button>
      `;
    }).join('');

    const tags = (node.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('');
    const objective = node.questObjective || Runner().objectiveForNode?.(node.id, state, map);
    const state = CS().getState();
    const objectiveDone = objective ? _isObjectiveDone(state, objective) : false;
    return `
      <div class="campaign-detail-title">
        <span>${_esc(node.title || node.id)}</span>
        <span class="campaign-pill">${_esc(node.kind || 'node')}</span>
        ${objective ? `<span class="campaign-pill ${objectiveDone ? 'is-current' : 'is-objective'}" title="${_escAttr(objective.questTitle || '')}">${_objectiveIcon(objective)} ${objectiveDone ? '✓ ' : ''}${_esc(objective.label)}</span>` : ''}
      </div>
      <div class="campaign-muted">${_esc(node.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      <div class="campaign-node-actions">
        ${isCurrent ? '<span class="campaign-pill is-current">Current</span>' : `<button class="campaign-action" data-campaign-action="move-node" data-node-id="${_escAttr(node.id)}" ${canMove ? '' : 'disabled'}>Move Here</button>`}
        ${captured ? `<span class="campaign-pill is-current">Captured</span>` : ''}
        ${entryResolved && !captured ? `<span class="campaign-pill">Story Resolved</span>` : ''}
        <button class="campaign-action" data-campaign-action="reveal-node" data-node-id="${_escAttr(node.id)}">Reveal</button>
        <button class="campaign-action" data-campaign-action="clear-node" data-node-id="${_escAttr(node.id)}">Clear</button>
      </div>
      ${node.campfire && isCurrent ? `
        <div class="campaign-node-actions">
          <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
          <button class="campaign-action" data-campaign-action="roll-party-chat">Camp Chat</button>
          <button class="campaign-action" data-campaign-tab="cook">Cook</button>
          <button class="campaign-action" data-campaign-tab="craft">Craft</button>
          <button class="campaign-action" data-campaign-tab="inventory">Inventory</button>
        </div>
      ` : ''}
      ${captured?.incomeOps?.length ? `<div class="campaign-muted">Income: ${_esc(captured.incomeOps.map((op) => op.op || 'op').join(', '))}</div>` : ''}
      ${notes.length ? `
        <div class="campaign-link-list">
          <div class="campaign-section-label">Manual Notes</div>
          ${notes.slice(0, 5).map((note) => `
            <div class="campaign-town-line is-${_escAttr(note.kind || 'event')}">
              <strong>${_esc(note.title || note.kind || 'Note')}</strong>
              <span>${_esc(note.text || '')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${exits ? `<div class="campaign-link-list"><div class="campaign-section-label">Exits</div>${exits}</div>` : '<div class="campaign-empty">No exits.</div>'}
    `;
  }

  function renderGridCellDetailSafe(cell, mapState = {}) {
    if (!cell) return '<div class="campaign-empty">No current cell.</div>';
    const state = CS().getState();
    const map = CS().getActiveMap();
    const key = _cellKey(cell.x, cell.y, cell.levelId, map);
    const tags = (cell.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('');
    const objective = cell.questObjective || Runner().objectiveForCell?.(cell, state, map);
    const threat = _movingThreatAt(state?.activeScenarioRun, map, cell.x, cell.y, cell.levelId);
    const objectiveDone = objective ? _isObjectiveDone(state, objective) : false;
    return `
      <div class="campaign-detail-title">
        <span>${_esc(cell.title || key)}</span>
        <span class="campaign-pill">${_esc(cell.kind || 'floor')}</span>
        ${objective ? `<span class="campaign-pill ${objectiveDone ? 'is-current' : 'is-objective'}" title="${_escAttr(objective.questTitle || '')}">${_objectiveIcon(objective)} ${objectiveDone ? '笨・' : ''}${_esc(objective.label)}</span>` : ''}
        ${threat ? `<span class="campaign-pill is-objective">${_esc(threat.icon || '!')} ${_esc(threat.label || threat.id)}</span>` : ''}
      </div>
      <div class="campaign-muted">${_esc(cell.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      <div class="campaign-node-actions">
        <span class="campaign-pill is-current">Current ${_esc(key)}</span>
        ${cell.levelName ? `<span class="campaign-pill">${_esc(cell.levelName)}</span>` : ''}
        ${cell.nextLevelId ? `<span class="campaign-pill">Leads to ${_esc(cell.nextLevelId.replace(/_/g, ' '))}</span>` : ''}
        ${mapState.clearedCells?.[key] ? '<span class="campaign-pill">Cleared</span>' : ''}
      </div>
    `;
  }

  function renderNodeDetailSafe(node, mapState = {}) {
    if (!node) return '<div class="campaign-empty">Select a node.</div>';
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const map = CS().getActiveMap();
    const isCurrent = run?.currentNode === node.id;
    const canMove = _canMoveTo(node.id, run, map);
    const captured = mapState.captured?.[node.id];
    const entryResolved = mapState.entryResolved?.[node.id];
    const notes = mapState.notes?.[node.id] || [];
    const exits = (node.exits || []).map((exit) => {
      const target = Runner().findNode(map, exit.to);
      const locked = mapState.locked?.[exit.to] || exit.locked;
      return `
        <button class="campaign-action" data-campaign-action="move-node" data-node-id="${_escAttr(exit.to)}" ${locked || !isCurrent ? 'disabled' : ''}>
          ${_esc(exit.label || target?.title || exit.to)}
        </button>
      `;
    }).join('');
    const tags = (node.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('');
    const objective = node.questObjective || Runner().objectiveForNode?.(node.id, state, map);
    const objectiveDone = objective ? _isObjectiveDone(state, objective) : false;
    return `
      <div class="campaign-detail-title">
        <span>${_esc(node.title || node.id)}</span>
        <span class="campaign-pill">${_esc(node.kind || 'node')}</span>
        ${objective ? `<span class="campaign-pill ${objectiveDone ? 'is-current' : 'is-objective'}" title="${_escAttr(objective.questTitle || '')}">${_objectiveIcon(objective)} ${objectiveDone ? '笨・' : ''}${_esc(objective.label)}</span>` : ''}
      </div>
      <div class="campaign-muted">${_esc(node.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      <div class="campaign-node-actions">
        ${isCurrent ? '<span class="campaign-pill is-current">Current</span>' : `<button class="campaign-action" data-campaign-action="move-node" data-node-id="${_escAttr(node.id)}" ${canMove ? '' : 'disabled'}>Move Here</button>`}
        ${captured ? `<span class="campaign-pill is-current">Captured</span>` : ''}
        ${entryResolved && !captured ? `<span class="campaign-pill">Story Resolved</span>` : ''}
        <button class="campaign-action" data-campaign-action="reveal-node" data-node-id="${_escAttr(node.id)}">Reveal</button>
        <button class="campaign-action" data-campaign-action="clear-node" data-node-id="${_escAttr(node.id)}">Clear</button>
      </div>
      ${node.campfire && isCurrent ? `
        <div class="campaign-node-actions">
          <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
          <button class="campaign-action" data-campaign-action="roll-party-chat">Camp Chat</button>
          <button class="campaign-action" data-campaign-tab="cook">Cook</button>
          <button class="campaign-action" data-campaign-tab="craft">Craft</button>
          <button class="campaign-action" data-campaign-tab="inventory">Inventory</button>
        </div>
      ` : ''}
      ${captured?.incomeOps?.length ? `<div class="campaign-muted">Income: ${_esc(captured.incomeOps.map((op) => op.op || 'op').join(', '))}</div>` : ''}
      ${notes.length ? `
        <div class="campaign-link-list">
          <div class="campaign-section-label">Manual Notes</div>
          ${notes.slice(0, 5).map((note) => `
            <div class="campaign-town-line is-${_escAttr(note.kind || 'event')}">
              <strong>${_esc(note.title || note.kind || 'Note')}</strong>
              <span>${_esc(note.text || '')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${exits ? `<div class="campaign-link-list"><div class="campaign-section-label">Exits</div>${exits}</div>` : '<div class="campaign-empty">No exits.</div>'}
    `;
  }

  function _nodeIcon(node) {
    if (node.questObjective) return _objectiveIcon(node.questObjective);
    if (node.capture) return '*';
    if (node.campfire) return 'C';
    const map = {
      entrance: 'E',
      exit: 'X',
      battle: 'B',
      event_battle: 'B',
      event: '?',
      trap: 'T',
      rest: 'R',
      campfire: 'C',
      resource: '*',
      reward: '$',
      shop: 'S',
      boss: '!'
    };
    return map[node.kind] || '.';
  }

  function _nodeIconSymbolId(node = {}) {
    if (node.capture) return 'cjs-node-icon-resource';
    if (node.campfire) return 'cjs-node-icon-campfire';
    const kind = String(node.kind || 'event').toLowerCase();
    const map = {
      entrance: 'cjs-node-icon-entrance',
      exit: 'cjs-node-icon-exit',
      battle: 'cjs-node-icon-battle',
      event_battle: 'cjs-node-icon-battle',
      boss: 'cjs-node-icon-boss',
      event: 'cjs-node-icon-event',
      trap: 'cjs-node-icon-trap',
      rest: 'cjs-node-icon-campfire',
      campfire: 'cjs-node-icon-campfire',
      resource: 'cjs-node-icon-resource',
      reward: 'cjs-node-icon-reward',
      shop: 'cjs-node-icon-shop'
    };
    return map[kind] || 'cjs-node-icon-event';
  }

  // Inline SVG symbol library — drawn from simple geometric shapes so we
  // don't depend on outside art for the map. Each symbol uses a 24x24 box.
  function _nodeIconDefs() {
    return `
      <symbol id="cjs-node-icon-battle" viewBox="0 0 24 24">
        <g fill="none" stroke="#ff8a5a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 5 L19 19 M19 5 L5 19"/>
          <circle cx="12" cy="12" r="2.2" fill="#ff8a5a" stroke="none"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-boss" viewBox="0 0 24 24">
        <g fill="#ff5050" stroke="#ffcfa0" stroke-width="1.4">
          <circle cx="12" cy="11" r="6.4"/>
          <circle cx="9.5" cy="10.5" r="1.4" fill="#0a0204"/>
          <circle cx="14.5" cy="10.5" r="1.4" fill="#0a0204"/>
          <path d="M5 6 L8 3 L8 6 M19 6 L16 3 L16 6 M9 16 L9 19 M11.5 16 L11.5 20 M14.5 16 L14.5 19" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-campfire" viewBox="0 0 24 24">
        <g>
          <path d="M12 17 Q7 13 9 7 Q10 10 12 8 Q14 10 15 7 Q17 13 12 17 Z" fill="#ffb454" stroke="#ff7a3a" stroke-width="0.8"/>
          <path d="M6 20 L18 20" stroke="#a37044" stroke-width="2" stroke-linecap="round"/>
          <path d="M7 20 L11 17 M17 20 L13 17" stroke="#a37044" stroke-width="1.6" stroke-linecap="round"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-shop" viewBox="0 0 24 24">
        <g fill="#ffd36f" stroke="#7a5616" stroke-width="1.2">
          <circle cx="9" cy="13" r="4.2"/>
          <circle cx="14" cy="15" r="4.2"/>
          <circle cx="11.5" cy="9" r="4.2"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-reward" viewBox="0 0 24 24">
        <g stroke="#a07026" stroke-width="1.2">
          <rect x="4" y="9" width="16" height="11" rx="1.5" fill="#c98a3a"/>
          <rect x="4" y="9" width="16" height="3.2" fill="#7a5618"/>
          <rect x="10.5" y="7" width="3" height="4" rx="1" fill="#ffd36f"/>
          <circle cx="12" cy="14.5" r="1.2" fill="#ffe9a8"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-trap" viewBox="0 0 24 24">
        <g fill="none" stroke="#c97aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 18 L12 5 L19 18 Z"/>
          <path d="M12 11 L12 14"/>
          <circle cx="12" cy="16.4" r="0.9" fill="#c97aff"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-resource" viewBox="0 0 24 24">
        <g fill="#76e4d1" stroke="#1b6b5e" stroke-width="1.2">
          <polygon points="12,4 18,10 15.5,19 8.5,19 6,10"/>
          <path d="M8.5 19 L12 10 L15.5 19 M6 10 L18 10" stroke="#0e3b35" stroke-width="0.8" fill="none"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-event" viewBox="0 0 24 24">
        <g fill="none" stroke="#9dd8ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 9 Q12 4 16 9 Q16 13 12 14 L12 17"/>
          <circle cx="12" cy="19.6" r="1" fill="#9dd8ff" stroke="none"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-exit" viewBox="0 0 24 24">
        <g fill="none" stroke="#ffe9a8" stroke-width="1.8" stroke-linejoin="round">
          <path d="M6 20 L6 9 Q6 5 12 5 Q18 5 18 9 L18 20 Z" fill="#1a1208"/>
          <path d="M6 20 L18 20" stroke-width="2"/>
          <circle cx="15" cy="13.5" r="0.9" fill="#ffe9a8" stroke="none"/>
        </g>
      </symbol>
      <symbol id="cjs-node-icon-entrance" viewBox="0 0 24 24">
        <g fill="none" stroke="#ffe9a8" stroke-width="1.8" stroke-linejoin="round">
          <path d="M5 20 L5 11 L10 6 L14 6 L19 11 L19 20 Z" fill="#1a1208"/>
          <path d="M10 20 L10 14 L14 14 L14 20" fill="#0c0805"/>
        </g>
      </symbol>
    `;
  }

  function _mapTheme(map = {}) {
    const w = String(map.theme || map.world || CS().getState()?.currentWorld || '').toLowerCase();
    if (w.includes('haven')) return 'haven';
    if (w.includes('zombie') || w.includes('rot')) return 'zombie';
    return '';
  }

  function _objectiveIcon(objective = {}) {
    const icons = {
      defeat: '⚔',
      recover: '★',
      reach: '◆',
      escort: '☗',
      investigate: '?',
      talk: '!',
      survive: '⌛',
      gather: '✿',
      craft: '⚒',
      custom: '◯'
    };
    return icons[objective.kind] || '★';
  }

  function _objectiveTag(objective = {}) {
    const short = String(objective.label || '').slice(0, 18);
    return short.length === 18 ? `${short}…` : short;
  }

  function _isObjectiveDone(state, objective) {
    if (objective?.completed) return true;
    if (!objective?.questId || !objective?.id) return false;
    const quest = state?.quests?.[objective.questId];
    const entry = (quest?.objectives || []).find((o) => o.id === objective.id);
    if (!entry) return false;
    return Number(entry.current || 0) >= Math.max(1, Number(entry.required || 1));
  }

  function _layers(map) {
    const explicit = Array.isArray(map.layers) ? map.layers : [];
    if (explicit.length) {
      return explicit.map((layer, index) => ({
        id: _normalizeLayerId(layer.id || layer.layerId || `layer_${index + 1}`),
        name: layer.name || layer.label || `Layer ${index + 1}`
      }));
    }
    const ids = Array.from(new Set((map.nodes || []).map((node) => _nodeLayer(node))));
    return ids.map((id, index) => ({ id, name: ids.length > 1 ? `Layer ${index + 1}` : 'Map' }));
  }

  function _renderLayerTabs(layers, activeLayer) {
    if (layers.length <= 1) return '';
    return `
      <div class="campaign-map-layers" role="tablist" aria-label="Map layers">
        ${layers.map((layer) => `
          <button class="campaign-map-layer ${layer.id === activeLayer ? 'is-active' : ''}" data-campaign-action="map-layer" data-layer="${_escAttr(layer.id)}" role="tab" aria-selected="${layer.id === activeLayer ? 'true' : 'false'}">
            ${_esc(layer.name)}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _mapMeta(map, visible, revealed) {
    const parts = [];
    if (map._procedural) parts.push('Procedural');
    if (map.setting) parts.push(map.setting);
    if (map.size) parts.push(map.size);
    parts.push(`${visible}/${revealed} shown`);
    return parts.join(' | ');
  }

  function _gridMeta(map, run, width, height) {
    const parts = [];
    if (map.setting) parts.push(map.setting);
    if (map.size) parts.push(map.size);
    const levelName = Runner().findCurrentCell?.()?.levelName;
    if (levelName) parts.push(levelName);
    parts.push(`${width}x${height}`);
    parts.push(`${(run.visitedCells || []).length} visited`);
    return parts.join(' | ');
  }

  function _nodeLayer(node) {
    return _normalizeLayerId(node?.layer || node?.layerId || 'layer_1');
  }

  function _normalizeLayerId(value) {
    return String(value || 'layer_1').replace(/\s+/g, '_').toLowerCase();
  }

  function _shortLabel(value) {
    const text = String(value || '');
    return text.length > 18 ? `${text.slice(0, 16)}..` : text;
  }

  function _canMoveTo(nodeId, run, map) {
    if (!run || !map || !nodeId) return false;
    if ((run.visitedNodes || []).includes(nodeId)) return true;
    const current = Runner().findNode(map, run.currentNode);
    return (current?.exits || []).some((exit) => exit.to === nodeId);
  }

  function _canMoveCell(run, x, y) {
    const current = run?.currentCell;
    if (!current) return false;
    const key = _cellKey(x, y, run?.mapLayer || null);
    if ((run.visitedCells || []).includes(key)) return true;
    return Math.abs(Number(current.x) - Number(x)) + Math.abs(Number(current.y) - Number(y)) <= 1;
  }

  function _gridIcon(cell, passable) {
    if (!passable) return '#';
    const map = {
      entrance: 'E',
      exit: 'X',
      battle: 'B',
      event_battle: 'B',
      event: '?',
      trap: 'T',
      rest: 'R',
      reward: '$',
      shop: 'S',
      boss: '!'
    };
    return map[cell.kind] || '.';
  }

  function _terrainAt(map, x, y) {
    const levelId = CS().getState()?.activeScenarioRun?.mapLayer || null;
    const levels = Array.isArray(map?.levels) ? map.levels : [];
    const level = levels.find((entry) => _normalizeLayerId(entry.id || entry.layerId || 'level_1') === _normalizeLayerId(levelId || map.defaultLevelId || 'level_1')) || levels[0] || null;
    const row = level?.terrain?.[Number(y)] || level?.grid?.[Number(y)] || map.terrain?.[Number(y)] || map.grid?.[Number(y)];
    return row?.[Number(x)] || 'floor';
  }

  function _cellPassable(map, x, y) {
    return !['wall', 'obstacle', 'blocked', 'void'].includes(String(_terrainAt(map, x, y)).toLowerCase());
  }

  function _movingThreatAt(run, map, x, y, levelId = null) {
    if (!run || !Array.isArray(run.movingThreats)) return null;
    const key = _cellKey(x, y, levelId);
    return run.movingThreats.find((threat) => _cellKey(threat.x, threat.y, threat.levelId || levelId) === key) || null;
  }

  function _cellKey(x, y, levelId = null) {
    const base = `${Number(x)},${Number(y)}`;
    const level = levelId ? _normalizeLayerId(levelId) : '';
    return level && level !== 'level_1' ? `${level}:${base}` : base;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) {
    return _esc(value);
  }

  return Object.freeze({
    render,
    renderGrid,
    renderSelectedNode,
    renderNodeDetail,
    renderGridCellDetail
  });
})();
