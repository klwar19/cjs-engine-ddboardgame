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
      return `
        <g class="campaign-map-node kind-${_escAttr(kind)} ${active ? 'is-active' : ''} ${visited ? 'is-visited' : ''} ${locked ? 'is-locked' : ''} ${cleared ? 'is-cleared' : ''} ${objective ? (objectiveDone ? 'has-objective is-objective-done' : 'has-objective') : ''}" data-node-id="${_escAttr(node.id)}" tabindex="0">
          <circle cx="${node.x}" cy="${node.y}" r="${active ? 20 : 16}"></circle>
          ${objective ? `<circle class="campaign-map-objective-ring" cx="${node.x}" cy="${node.y}" r="${active ? 24 : 20}" />` : ''}
          <text class="campaign-map-icon" x="${node.x}" y="${node.y + 4}" text-anchor="middle">${_nodeIcon(node)}</text>
          <text class="campaign-map-label" x="${node.x}" y="${node.y + 34}" text-anchor="middle">${_esc(_shortLabel(node.title || node.id))}</text>
          ${objective ? `<text class="campaign-map-objective-label" x="${node.x}" y="${node.y - 22}" text-anchor="middle">${_esc(_objectiveTag(objective))}</text>` : ''}
        </g>
      `;
    }).join('');

    container.innerHTML = `
      <div class="campaign-map-shell">
        <div class="campaign-map-head">
          <div>
            <h2>${_esc(map.name || 'Scenario Map')}</h2>
            <span class="campaign-muted">${_esc(_mapMeta(map, nodes.length, revealedNodes.length))}</span>
          </div>
          ${_renderLayerTabs(layers, activeLayer)}
        </div>
        <svg class="campaign-map-canvas" viewBox="0 0 ${width} ${height}" role="img" aria-label="${_escAttr(map.name || map.id)}">
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
        cells.push(`
          <button class="campaign-grid-cell kind-${_escAttr(String(cell.kind || 'floor').replace(/[^a-z0-9_-]/gi, '_').toLowerCase())} ${isCurrent ? 'is-active' : ''} ${isVisited ? 'is-visited' : ''} ${isRevealed ? '' : 'is-hidden'} ${passable ? '' : 'is-blocked'} ${objective ? (objectiveDone ? 'has-objective is-objective-done' : 'has-objective') : ''}"
            data-campaign-action="move-cell" data-x="${x}" data-y="${y}" ${canMove || isCurrent ? '' : 'disabled'} title="${_escAttr(objectiveTitle ? `${objectiveTitle} — ${cell.title || key}` : cell.title || key)}">
            <span>${isRevealed ? `${objective ? _objectiveIcon(objective) : _gridIcon(cell, passable)}${threat ? ` ${_esc(threat.icon || '!')}` : ''}` : ''}</span>
            <small>${isRevealed ? _esc(_shortLabel(cell.title || key)) : ''}</small>
          </button>
        `);
      }
    }
    const currentCell = Runner().findCurrentCell?.() || Runner().findCell?.(map, current.x, current.y, run.mapLayer);
    container.innerHTML = `
      <div class="campaign-map-shell">
        <div class="campaign-map-head">
          <div>
            <h2>${_esc(map.name || 'Scenario Grid')}</h2>
            <span class="campaign-muted">${_esc(_gridMeta(map, run, width, height))}</span>
          </div>
        </div>
        <div class="campaign-grid-map" style="--grid-cols:${width}">
          ${cells.join('')}
        </div>
        <div class="campaign-node-detail">
          ${renderGridCellDetailSafe(currentCell, mapState)}
        </div>
      </div>
    `;
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
