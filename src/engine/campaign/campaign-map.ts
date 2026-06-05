// campaign-map.ts — Tier 3 TS port of js/campaign/campaign-map.js (engine
// cluster: campaign). Node-map renderer for Campaign Mode (render/renderGrid/
// renderSelectedNode/renderNodeDetail/renderGridCellDetail), binding its own
// private click listener that dispatches typed campaign actions. Exports
// `CampaignMap` and installs window.CJS.CampaignMap. Body verbatim from the
// legacy IIFE; import path adjusted for the src/engine/ location.

import { dispatchCampaignAction } from "../../campaign/actions";

window.CJS = window.CJS || {};

export const CampaignMap = (() => {
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
    const revealedNodes = (map.nodes || []).filter((node) => _nodeFogState(node, mapState, run).visible);
    const nodes = layers.length > 1
      ? revealedNodes.filter((node) => _nodeLayer(node) === activeLayer)
      : revealedNodes;
    // Canvas size adapts to the map. Generated maps now carry canvasWidth/canvasHeight;
    // hand-authored maps default to 680x420 unless their node bounds need more room.
    const { width, height } = _nodeCanvasSize(map);
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
      const fog = _nodeFogState(node, mapState, run);
      const active = fog.current;
      const visited = fog.visited;
      const locked = mapState.locked?.[node.id];
      const cleared = mapState.cleared?.[node.id];
      const kind = String(fog.known ? (node.kind || 'node') : 'unknown').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      const objective = fog.known ? (node.questObjective || Runner().objectiveForNode?.(node.id, state, map)) : null;
      const objectiveDone = objective && _isObjectiveDone(state, objective);
      const radius = active ? 22 : 18;
      const iconRadius = active ? 13 : 11;
      const iconId = fog.known ? _nodeIconSymbolId(node) : 'cjs-node-icon-event';
      const label = fog.known ? _shortLabel(node.title || node.id) : 'Unmapped';
      return `
        <g class="campaign-map-node kind-${_escAttr(kind)} ${active ? 'is-active' : ''} ${visited ? 'is-visited' : ''} ${fog.scouted ? 'is-scouted' : ''} ${locked ? 'is-locked' : ''} ${cleared ? 'is-cleared' : ''} ${objective ? (objectiveDone ? 'has-objective is-objective-done' : 'has-objective') : ''}" data-node-id="${_escAttr(node.id)}" tabindex="0">
          <circle cx="${node.x}" cy="${node.y}" r="${radius}"></circle>
          ${objective ? `<circle class="campaign-map-objective-ring" cx="${node.x}" cy="${node.y}" r="${radius + 6}" />` : ''}
          <use href="#${iconId}" x="${node.x - iconRadius}" y="${node.y - iconRadius}" width="${iconRadius * 2}" height="${iconRadius * 2}" class="campaign-map-node-art"/>
          <text class="campaign-map-label" x="${node.x}" y="${node.y + 36}" text-anchor="middle">${_esc(label)}</text>
          ${objective ? `<text class="campaign-map-objective-label" x="${node.x}" y="${node.y - 26}" text-anchor="middle">${_esc(_objectiveTag(objective))}</text>` : ''}
        </g>
      `;
    }).join('');

    // Bin's party marker — placed over the current node so the player always
    // sees where they are on the world map (matches the grid map identity).
    const playerMarkupSvg = currentNode && nodes.some((n) => n.id === currentNode.id)
      ? _nodeMapPlayerMarkup(currentNode, run)
      : '';

    const theme = _mapTheme(map);
    const setting = _mapSetting(map);
    const settingBg = _settingBackgroundHref(setting);
    container.innerHTML = `
      <div class="campaign-map-shell" data-setting="${_escAttr(setting)}" data-theme="${_escAttr(theme)}">
        <div class="campaign-map-head">
          <div>
            <h2>${_esc(map.name || 'Scenario Map')}</h2>
            <span class="campaign-muted">${_esc(_mapMeta(map, nodes.length, revealedNodes.length))}</span>
          </div>
          ${_renderLayerTabs(layers, activeLayer)}
        </div>
        <svg class="campaign-map-canvas" viewBox="0 0 ${width} ${height}" role="img" aria-label="${_escAttr(map.name || map.id)}" data-theme="${_escAttr(theme)}" data-setting="${_escAttr(setting)}" preserveAspectRatio="xMidYMid meet">
          <defs>${_nodeIconDefs()}${_nodeMapBackgroundDefs(setting)}</defs>
          <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="campaign-map-bg"></rect>
          ${settingBg ? `<image href="${_escAttr(settingBg)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" class="campaign-map-setting-art" />` : ''}
          <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="campaign-map-bg-overlay" />
          ${lines.join('')}
          ${nodeMarkup}
          ${playerMarkupSvg}
        </svg>
        <div class="campaign-node-detail">
          ${renderNodeDetailSafe(currentNode, mapState)}
        </div>
      </div>
    `;
    bindMapActions(container);

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
    const current = run.currentCell || { x: 0, y: 0 };
    const setting = _mapSetting(map);
    const cells = [];
    const terrainSeen = new Set();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = _cellKey(x, y, activeLevelId);
        const terrainKind = _terrainAt(map, x, y, activeLevelId);
        const baseCell = Runner().findCell?.(map, x, y, activeLevelId);
        const cell = baseCell
          ? { ...baseCell, terrain: baseCell.terrain || terrainKind }
          : { x, y, kind: terrainKind, terrain: terrainKind, title: key };
        const isCurrent = Number(current.x) === x && Number(current.y) === y;
        const fog = _cellFogState(cell, key, mapState, run, current);
        if (fog.known) terrainSeen.add(String(terrainKind || '').toLowerCase());
        const threat = fog.known ? _movingThreatAt(run, map, x, y, activeLevelId) : null;
        const isRevealed = fog.visible;
        const isVisited = fog.visited;
        const passable = _cellPassable(map, x, y, activeLevelId);
        const canMove = isRevealed && passable && _canMoveCell(run, x, y);
        const objective = fog.known ? (cell.questObjective || Runner().objectiveForCell?.(cell, state, map)) : null;
        const objectiveDone = objective && _isObjectiveDone(state, objective);
        const objectiveTitle = objective
          ? `${objectiveDone ? '✓ ' : '★ '}${objective.label}`
          : '';
        const threatAdjacent = threat ? _isAdjacent(current, threat) : false;
        const kindClass = fog.known ? _gridKindClass(cell) : 'unknown';
        const nodeBadgeClass = fog.known ? _gridNodeBadge(cell, objective) : '';
        const threatMarkup = threat ? _threatMarkupV2(threat, threatAdjacent, current) : '';
        const playerMarkup = isCurrent ? _playerMarkupV2(run) : '';
        const labelMarkup = fog.known && cell.title
          ? `<span class="campaign-grid-cell-label">${_esc(_shortLabel(cell.title))}</span>`
          : (fog.scouted ? '<span class="campaign-grid-cell-label campaign-grid-cell-fog">?</span>' : '');
        cells.push(`
          <button class="campaign-grid-cell v2 kind-${kindClass} ${isCurrent ? 'is-active' : ''} ${isVisited ? 'is-visited' : ''} ${fog.scouted ? 'is-scouted' : ''} ${isRevealed ? '' : 'is-hidden'} ${passable ? '' : 'is-blocked'} ${objective ? (objectiveDone ? 'has-objective is-objective-done' : 'has-objective') : ''} ${threat ? 'has-threat' : ''}"
            data-map-move-cell="1" data-x="${x}" data-y="${y}" ${canMove || isCurrent ? '' : 'disabled'} title="${_escAttr(_cellTitleText(cell, key, objective, objectiveTitle, threat, fog.known))}">
            ${nodeBadgeClass && isRevealed ? `<span class="campaign-grid-cell-node ${nodeBadgeClass}" aria-hidden="true"></span>` : ''}
            ${threatMarkup}
            ${playerMarkup}
            ${labelMarkup}
          </button>
        `);
      }
    }
    const currentCell = Runner().findCurrentCell?.() || Runner().findCell?.(map, current.x, current.y, activeLevelId);
    const theme = _mapTheme(map);
    const gridLayers = _gridLevelTabs(map);
    const layerTabs = _renderGridLayerTabs(gridLayers, activeLevelId);
    const activeThreats = _visibleLevelThreats(run, map, activeLevelId, mapState, current);
    const threatStrip = _renderThreatStrip(activeThreats, current);
    const legend = _renderTerrainLegend(terrainSeen);
    container.innerHTML = `
      <div class="campaign-map-shell v2" data-setting="${_escAttr(setting)}" data-theme="${_escAttr(theme)}">
        <div class="campaign-map-head v2">
          <div>
            <h2>${_esc(map.name || 'Scenario Grid')}</h2>
            <span class="campaign-muted">${_esc(_gridMeta(map, run, width, height))}</span>
            <div class="campaign-map-legend">${legend}</div>
          </div>
          ${layerTabs}
        </div>
        ${threatStrip}
        <div class="campaign-grid-map v2" style="--grid-cols:${width}" data-theme="${_escAttr(theme)}" data-setting="${_escAttr(setting)}">
          ${cells.join('')}
        </div>
        <div class="campaign-node-detail">
          ${renderGridCellDetailSafe(currentCell, mapState)}
        </div>
      </div>
    `;
    bindMapActions(container);
  }

  function bindMapActions(container) {
    if (!container || container.__cjsMapActionsBound) return;
    container.__cjsMapActionsBound = true;
    container.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn: any = target.closest('[data-map-move-cell], [data-map-layer], [data-map-move-node], [data-map-reveal-node], [data-map-clear-node], [data-map-camp-rest], [data-map-open-tab]');
      if (!btn || !container.contains(btn) || btn.disabled) return;
      event.preventDefault();
      if (btn.dataset.mapMoveCell) {
        dispatchCampaignAction('move-cell', { x: btn.dataset.x, y: btn.dataset.y });
        return;
      }
      if (btn.dataset.mapLayer) {
        dispatchCampaignAction('map-layer', { layer: btn.dataset.mapLayer });
        return;
      }
      if (btn.dataset.mapMoveNode) {
        dispatchCampaignAction('move-node', { nodeId: btn.dataset.mapMoveNode });
        return;
      }
      if (btn.dataset.mapRevealNode) {
        dispatchCampaignAction('reveal-node', { nodeId: btn.dataset.mapRevealNode });
        return;
      }
      if (btn.dataset.mapClearNode) {
        dispatchCampaignAction('clear-node', { nodeId: btn.dataset.mapClearNode });
        return;
      }
      if (btn.dataset.mapCampRest) {
        dispatchCampaignAction('camp-rest');
        return;
      }
      const navAction = {
        cook: 'open-cook-tab',
        craft: 'open-craft-tab',
        inventory: 'open-inventory-tab'
      }[btn.dataset.mapOpenTab || ''];
      if (navAction) dispatchCampaignAction(navAction);
    });
  }

  function _renderTerrainLegend(terrainSeen) {
    const LEGEND_DEFS = [
      { kinds: ['grass', 'meadow', 'field'],       label: 'Grass',      color: '#86c060' },
      { kinds: ['forest', 'tree', 'woods'],        label: 'Forest',     color: '#3a6b34' },
      { kinds: ['dirt', 'mud'],                    label: 'Dirt / Mud', color: '#a07a52' },
      { kinds: ['path', 'road', 'patrol', 'lane'], label: 'Path',       color: '#c2a981' },
      { kinds: ['stone', 'tile', 'floor'],         label: 'Stone',      color: '#8d959a' },
      { kinds: ['wall', 'obstacle', 'rock', 'pillar', 'blocked'], label: 'Wall', color: '#3a3f44' },
      { kinds: ['water', 'river', 'pond', 'lake'], label: 'Water',      color: '#5fa8d0' },
      { kinds: ['snow', 'frost', 'frostwood'],     label: 'Snow',       color: '#f5fbff' },
      { kinds: ['ice'],                            label: 'Ice',        color: '#cae6f7' },
      { kinds: ['rubble', 'broken'],               label: 'Rubble',     color: '#7c684b' },
      { kinds: ['sand', 'dune', 'desert'],         label: 'Sand',       color: '#d6b272' },
      { kinds: ['swamp', 'bog', 'marsh'],          label: 'Swamp',      color: '#5a7036' },
      { kinds: ['lava', 'magma'],                  label: 'Lava',       color: '#ff7a26' },
      { kinds: ['sewer'],                          label: 'Sewer',      color: '#536b30' },
      { kinds: ['cave'],                           label: 'Cave',       color: '#5a402a' },
      { kinds: ['brick'],                          label: 'Brick',      color: '#a4593c' }
    ];
    const seen = new Set(Array.from(terrainSeen || []).map((kind) => String(kind || '').toLowerCase()));
    const present = LEGEND_DEFS.filter((entry) => entry.kinds.some((kind) => seen.has(kind)));
    const shortlist = present.length ? present : LEGEND_DEFS.slice(0, 6);
    return shortlist.map((entry) =>
      `<span style="--legend-color:${entry.color}"><i></i>${_esc(entry.label)}</span>`
    ).join('');
  }

  function _renderThreatStrip(threats: any[] = [], current: any = {}) {
    if (!threats.length) return '';
    const items = threats.map((threat) => {
      const mode = _threatModeKey(threat);
      const distance = _manhattan(current, threat);
      const distanceText = distance === null
        ? ''
        : (distance === 0 ? ' · contact' : ` · ${distance} step${distance === 1 ? '' : 's'}`);
      const label = _shortLabel(threat.label || threat.id || 'Roamer', 18);
      return `<span class="campaign-grid-threat-strip-item mode-${_escAttr(mode)}">
        <i class="campaign-grid-threat-strip-dot mode-${_escAttr(mode)}"></i>
        <b>${_esc(label)}</b>
        <em>${_esc(_threatModeText(mode))}${distanceText}</em>
      </span>`;
    }).join('');
    return `<div class="campaign-grid-threat-strip" role="status" aria-live="polite">${items}</div>`;
  }

  function _gridLevelTabs(map: any = {}) {
    const levels = Array.isArray(map?.levels) ? map.levels : [];
    if (!levels.length) return [];
    return levels.map((level, index) => ({
      id: _normalizeLayerId(level.id || level.layerId || `level_${index + 1}`),
      name: level.name || level.label || `Level ${index + 1}`
    }));
  }

  function _renderGridLayerTabs(layers, activeLayerId) {
    if (!layers || layers.length <= 1) return '';
    const active = _normalizeLayerId(activeLayerId || layers[0]?.id);
    return `
      <div class="campaign-map-layers" role="tablist" aria-label="Grid levels">
        ${layers.map((layer) => `
          <button class="campaign-map-layer ${layer.id === active ? 'is-active' : ''}" data-map-layer="${_escAttr(layer.id)}" role="tab" aria-selected="${layer.id === active ? 'true' : 'false'}">
            ${_esc(layer.name)}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _activeLevelThreats(run, map, activeLevelId) {
    if (!run || !Array.isArray(run.movingThreats)) return [];
    const target = _normalizeLayerId(activeLevelId || map?.defaultLevelId || 'level_1');
    return run.movingThreats.filter((threat) =>
      _normalizeLayerId(threat.levelId || target) === target);
  }

  function _nodeFogState(node: any = {}, mapState: any = {}, run: any = {}) {
    const id = node?.id;
    const current = !!(id && run?.currentNode === id);
    const visited = !!(id && (mapState.visited?.[id] || (run?.visitedNodes || []).includes(id)));
    const visible = !!(
      current
      || visited
      || node?.discoveredByDefault
      || (id && mapState.revealed?.[id])
      || (id && (run?.revealedNodes || []).includes(id))
    );
    const known = !!(
      current
      || visited
      || node?.discoveredByDefault
      || (id && mapState.cleared?.[id])
      || (id && mapState.captured?.[id])
      || (id && mapState.entryResolved?.[id])
    );
    return { current, visited, visible, known, scouted: visible && !known };
  }

  function _cellFogState(cell: any = {}, key = '', mapState: any = {}, run: any = {}, current: any = {}) {
    const cellKey = key || _cellKey(cell.x, cell.y, cell.levelId || run?.mapLayer || null);
    const currentKey = current ? _cellKey(current.x, current.y, run?.mapLayer || cell.levelId || null) : '';
    const isCurrent = !!(cellKey && currentKey && cellKey === currentKey);
    const visited = !!(cellKey && (mapState.visitedCells?.[cellKey] || (run?.visitedCells || []).includes(cellKey)));
    const visible = !!(
      isCurrent
      || visited
      || cell?.discoveredByDefault
      || (cellKey && mapState.revealedCells?.[cellKey])
      || (cellKey && (run?.revealedCells || []).includes(cellKey))
    );
    const known = !!(
      isCurrent
      || visited
      || cell?.discoveredByDefault
      || (cellKey && mapState.clearedCells?.[cellKey])
    );
    return { current: isCurrent, visited, visible, known, scouted: visible && !known };
  }

  function _visibleLevelThreats(run, map, activeLevelId, mapState: any = {}, current: any = {}) {
    return _activeLevelThreats(run, map, activeLevelId).filter((threat) => {
      const key = _cellKey(threat.x, threat.y, threat.levelId || activeLevelId || null);
      const cell = Runner().findCell?.(map, threat.x, threat.y, threat.levelId || activeLevelId)
        || { x: threat.x, y: threat.y, levelId: threat.levelId || activeLevelId };
      return _cellFogState(cell, key, mapState, run, current).known;
    });
  }

  function _mapSetting(map: any = {}) {
    const scenario = CS().getActiveScenario?.();
    const raw = String(
      map.setting
      || map.mapSetting
      || map.mapType
      || scenario?.mapSetting
      || scenario?.setting
      || scenario?.mapType
      || ''
    ).toLowerCase();
    if (!raw || raw === 'any') return 'outdoor';
    if (['woods', 'forest', 'trees'].includes(raw)) return 'forest';
    if (['outdoor', 'field', 'plain', 'wilderness'].includes(raw)) return 'outdoor';
    if (['urban', 'town', 'city', 'street'].includes(raw)) return 'urban';
    if (['dungeon', 'keep', 'lair'].includes(raw)) return 'dungeon';
    if (['cave', 'cavern', 'tunnel'].includes(raw)) return 'cave';
    if (['sewer', 'drain'].includes(raw)) return 'sewer';
    if (['ruins', 'ruin', 'relic'].includes(raw)) return 'ruins';
    if (['mountain', 'ridge', 'summit', 'alpine'].includes(raw)) return 'mountain';
    if (['snowfield', 'tundra', 'frostwood', 'arctic'].includes(raw)) return 'snowfield';
    if (['desert', 'wasteland', 'sand'].includes(raw)) return 'desert';
    if (['marsh', 'swamp', 'bog'].includes(raw)) return 'swamp';
    if (['volcano', 'magma', 'firelands', 'lava'].includes(raw)) return 'volcano';
    if (['temple', 'shrine', 'chapel'].includes(raw)) return 'temple';
    if (['house', 'manor', 'hut'].includes(raw)) return 'house';
    if (['tavern', 'inn', 'bar'].includes(raw)) return 'tavern';
    if (['castle', 'fortress'].includes(raw)) return 'castle';
    if (['arena', 'pit'].includes(raw)) return 'arena';
    return 'outdoor';
  }

  // Returns the CSS modifier class used to pick the tile background.
  // Purpose kinds (battle, shop, rest, etc.) get the underlying terrain
  // class so the tile floor still reads correctly under the node badge.
  function _gridKindClass(cell: any = {}) {
    const PURPOSE_KINDS = new Set([
      'battle', 'event_battle', 'boss', 'rest', 'camp', 'campfire',
      'shop', 'story', 'event', 'special_event', 'treasure', 'reward',
      'loot', 'resource', 'trap', 'entrance', 'exit', 'objective'
    ]);
    const rawKind = String(cell.kind || '').toLowerCase();
    const rawTerrain = String(cell.terrain || '').toLowerCase();
    const raw = (PURPOSE_KINDS.has(rawKind) ? rawTerrain : rawKind) || rawTerrain || 'floor';
    if (raw === 'grass' || raw === 'meadow' || raw === 'field') return 'grass';
    if (raw === 'forest' || raw === 'tree' || raw === 'woods') return 'forest';
    if (raw === 'dirt' || raw === 'mud') return 'dirt';
    if (raw === 'stone' || raw === 'tile') return 'stone';
    // Keep 'floor' as its own class so each map setting can re-skin
    // a generic floor cell (e.g. outdoor=snow, dungeon=stone, cave=cave).
    if (raw === 'floor') return 'floor';
    if (raw === 'wall' || raw === 'obstacle' || raw === 'rock' || raw === 'pillar') return 'wall';
    if (raw === 'water' || raw === 'river' || raw === 'pond' || raw === 'lake') return 'water';
    if (raw === 'path' || raw === 'road' || raw === 'lane' || raw === 'patrol' || raw === 'cobble') return 'path';
    if (raw === 'snow' || raw === 'frost' || raw === 'frostwood') return 'snow';
    if (raw === 'ice') return 'ice';
    if (raw === 'rubble' || raw === 'broken') return 'rubble';
    if (raw === 'sand' || raw === 'dune' || raw === 'desert') return 'sand';
    if (raw === 'swamp' || raw === 'bog' || raw === 'marsh') return 'swamp';
    if (raw === 'lava' || raw === 'magma') return 'lava';
    if (raw === 'sewer' || raw === 'drain') return 'sewer';
    if (raw === 'cave' || raw === 'cavern') return 'cave';
    if (raw === 'brick') return 'brick';
    return raw.replace(/[^a-z0-9_-]/g, '_');
  }

  function _gridNodeBadge(cell: any = {}, objective = null) {
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

  function _playerMarkupV2(run: any = {}) {
    const facing = _normalizeFacing(run?.facing || 'down');
    const moving = _recentMotionClass(run?.playerMotionAt);
    return `
      <span class="campaign-grid-player-shadow" aria-hidden="true"></span>
      <span class="campaign-grid-player ${moving}" data-facing="${_escAttr(facing)}" aria-label="Bin's party stands here"></span>
      <span class="campaign-grid-player-tag" aria-hidden="true">Bin</span>
    `;
  }

  // Bin's marker drawn over the current node on the node-map SVG. Uses
  // foreignObject so we can reuse the same CSS-driven sprite sheet as the
  // grid map, keeping the player's identity consistent across views.
  function _nodeMapPlayerMarkup(node: any = {}, run: any = {}) {
    const cx = Number(node.x) || 0;
    const cy = Number(node.y) || 0;
    const size = 56;
    const half = size / 2;
    const facing = _normalizeFacing(run?.facing || 'down');
    const moving = _recentMotionClass(run?.playerMotionAt);
    return `
      <g class="campaign-map-player-art" data-node-id="${_escAttr(node.id)}">
        <ellipse cx="${cx}" cy="${cy + 26}" rx="${size * 0.36}" ry="6" class="campaign-map-player-shadow"/>
        <foreignObject x="${cx - half}" y="${cy - half - 18}" width="${size}" height="${size}">
          <div xmlns="http://www.w3.org/1999/xhtml" class="campaign-map-player-frame">
            <span class="campaign-map-player-sprite ${moving}"
                  data-facing="${_escAttr(facing)}"
                  role="img"
                  aria-label="Bin"></span>
          </div>
        </foreignObject>
        <rect class="campaign-map-player-tag-bg" x="${cx - 22}" y="${cy + 34}" width="44" height="14" rx="7"/>
        <text class="campaign-map-player-tag" x="${cx}" y="${cy + 44}" text-anchor="middle">Bin</text>
      </g>
    `;
  }

  function _threatMarkupV2(threat: any = {}, adjacent = false, current = null) {
    const mode = _threatModeKey(threat);
    const modeText = _threatModeText(mode);
    const distance = current ? _manhattan(current, threat) : null;
    const titleParts = [threat.label || threat.id || 'Threat'];
    titleParts.push(modeText);
    if (distance !== null) {
      titleParts.push(`${distance} step${distance === 1 ? '' : 's'} away`);
    }
    if (adjacent) titleParts.push('CONTACT IMMINENT');
    const title = _escAttr(titleParts.join(' — '));
    const sprite = _threatSprite(threat);
    const facing = _threatFacing(threat, current);
    const inlineSprite = sprite ? `style="--threat-sprite:url('${_escAttr(sprite)}');"` : '';
    const moving = _recentMotionClass(threat._motionAt);
    const spriteMode = sprite ? (_isThreatSheet(sprite) ? 'has-sheet' : 'has-sprite') : '';
    const isChasing = (mode as string) === 'chase' || (mode as string) === 'pursue';
    const closeIn = distance !== null && distance <= 2;
    const cls = [
      'campaign-grid-threat v2',
      adjacent ? 'is-adjacent' : '',
      isChasing ? 'is-chasing' : '',
      closeIn && isChasing ? 'is-close-in' : '',
      `mode-${mode}`,
      spriteMode,
      moving
    ].filter(Boolean).join(' ');
    const tagText = isChasing
      ? (adjacent ? 'ATTACK!' : (closeIn ? 'CHASE!' : 'Chasing'))
      : (mode === 'patrol' ? 'Patrol' : (adjacent ? 'Roamer!' : 'Roamer'));
    const tagCls = [
      'campaign-grid-threat-tag',
      adjacent ? 'is-adjacent' : '',
      isChasing ? 'is-chasing' : '',
      `mode-${mode}`
    ].filter(Boolean).join(' ');
    const sigil = isChasing
      ? `<span class="campaign-grid-threat-sigil is-chasing" aria-hidden="true"></span>`
      : (mode === 'patrol'
        ? `<span class="campaign-grid-threat-sigil is-patrol" data-facing="${_escAttr(facing)}" aria-hidden="true"></span>`
        : '');
    const alertRing = isChasing
      ? '<span class="campaign-grid-threat-alert" aria-hidden="true"></span>'
      : '';
    return `
      <span class="campaign-grid-threat-shadow" aria-hidden="true"></span>
      ${alertRing}
      <span class="${cls}" data-facing="${_escAttr(facing)}" data-mode="${_escAttr(mode)}" title="${title}" aria-hidden="true" ${inlineSprite}></span>
      ${sigil}
      <span class="${tagCls}" aria-hidden="true">${_esc(tagText)}</span>
    `;
  }

  function _threatModeKey(threat: any = {}) {
    const raw = String(threat.moveMode || threat.move || 'random').toLowerCase();
    if (raw === 'chase' || raw === 'pursue' || raw === 'hunt') return 'chase';
    if (raw === 'patrol' || raw === 'route') return 'patrol';
    if (raw === 'static' || raw === 'hold' || raw === 'still') return 'static';
    return 'random';
  }

  function _threatModeText(mode) {
    if (mode === 'chase') return 'CHASING the party';
    if (mode === 'patrol') return 'patrolling a beat';
    if (mode === 'static') return 'holding position';
    return 'roaming the area';
  }

  function _manhattan(a: any = {}, b: any = {}) {
    if (!a || !b) return null;
    const ax = Number(a.x); const ay = Number(a.y);
    const bx = Number(b.x); const by = Number(b.y);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return null;
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function _threatFacing(threat: any = {}, current = null) {
    const last = String(threat._lastDir || '').toLowerCase();
    if (['up', 'down', 'left', 'right'].includes(last)) return last;
    if (current && Number.isFinite(Number(current.x)) && Number.isFinite(Number(current.y))) {
      const dx = Number(current.x) - Number(threat.x);
      const dy = Number(current.y) - Number(threat.y);
      if (dx === 0 && dy === 0) return 'down';
      if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
      return dy >= 0 ? 'down' : 'up';
    }
    return 'down';
  }

  function _normalizeFacing(value) {
    const v = String(value || 'down').toLowerCase();
    if (v === 'up' || v === 'north') return 'up';
    if (v === 'left' || v === 'west') return 'left';
    if (v === 'right' || v === 'east') return 'right';
    return 'down';
  }

  function _recentMotionClass(value, windowMs = 850) {
    const timestamp = Number(value || 0);
    return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp <= windowMs
      ? 'is-moving'
      : '';
  }

  function _isAdjacent(current: any = {}, threat: any = {}) {
    if (!current || !threat) return false;
    const dx = Math.abs(Number(current.x) - Number(threat.x));
    const dy = Math.abs(Number(current.y) - Number(threat.y));
    return (dx + dy) <= 1;
  }

  function _threatMarkup(threat: any = {}, adjacent = false) {
    const sprite = _threatSprite(threat);
    const icon = _threatIcon(threat);
    const title = _escAttr(`${threat.label || threat.id || 'Threat'} — close to engage`);
    const cls = `campaign-grid-threat ${adjacent ? 'is-adjacent' : ''}`;
    if (sprite) {
      return `<span class="${cls}" title="${title}" style="background-image:url('${_escAttr(sprite)}');background-size:cover;background-position:center;"></span>`;
    }
    return `<span class="${cls}" title="${title}">${_esc(icon)}</span>`;
  }

  function _threatSprite(threat: any = {}) {
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

  function _isThreatSheet(path = '') {
    const value = String(path || '').toLowerCase();
    return value.includes('sheet') || value.includes('shadow_stalker') || value.includes('move_');
  }

  function _threatIcon(threat: any = {}) {
    if (threat.icon && threat.icon !== '!' && threat.icon !== '?') return threat.icon;
    const monsterIds = _threatMonsterIds(threat);
    for (const id of monsterIds) {
      const record = window.CJS.DataStore?.get?.('monsters', id);
      if (record?.icon) return record.icon;
    }
    return threat.icon || '👹';
  }

  function _threatMonsterIds(threat: any = {}) {
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

  function _glyphForCell(cell: any = {}, opts: any = {}) {
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

  function _cellTitleText(cell: any = {}, key = '', objective = null, objectiveTitle = '', threat = null, known = true) {
    if (!known) return 'Scouted nearby ground - details hidden by fog';
    const base = cell.title || key;
    const parts = [];
    if (objective) parts.push(objectiveTitle);
    parts.push(base);
    if (threat) {
      const mode = _threatModeKey(threat);
      const modeText = _threatModeText(mode);
      parts.push(`${threat.label || threat.id || 'Roaming enemy'} (${modeText})`);
    }
    return parts.join(' — ');
  }

  function renderGridCellDetail(cell, mapState: any = {}) {
    if (!cell) return '<div class="campaign-empty">No current cell.</div>';
    const state = CS().getState();
    const map = CS().getActiveMap();
    const key = _cellKey(cell.x, cell.y, cell.levelId, map);
    const tags = (cell.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('');
    const objective = cell.questObjective || Runner().objectiveForCell?.(cell, state, map);
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

  function renderNodeDetail(node, mapState: any = {}) {
    if (!node) return '<div class="campaign-empty">Select a node.</div>';
    const state = CS().getState();
    const run = state?.activeScenarioRun;
    const map = CS().getActiveMap();
    const isCurrent = run?.currentNode === node.id;
    const canMove = _canMoveTo(node.id, run, map);
    const fog = _nodeFogState(node, mapState, run);
    if (fog.scouted) {
      return `
        <div class="campaign-detail-title">
          <span>Unmapped Location</span>
          <span class="campaign-pill">Scouted</span>
        </div>
        <div class="campaign-muted">Your party can travel this way, but the exact terrain, encounter, and objective details are still under fog.</div>
        <div class="campaign-node-actions">
          <button class="campaign-action" data-map-move-node="${_escAttr(node.id)}" ${canMove ? '' : 'disabled'}>Move Here</button>
        </div>
      `;
    }
    const captured = mapState.captured?.[node.id];
    const entryResolved = mapState.entryResolved?.[node.id];
    const notes = mapState.notes?.[node.id] || [];
    const exits = (node.exits || []).map((exit) => {
      const target = Runner().findNode(map, exit.to);
      const locked = mapState.locked?.[exit.to] || exit.locked;
      const targetFog = target ? _nodeFogState(target, mapState, run) : { known: false };
      const exitLabel = targetFog.known ? (exit.label || target?.title || exit.to) : (exit.scoutedLabel || 'Unmapped route');
      return `
        <button class="campaign-action" data-map-move-node="${_escAttr(exit.to)}" ${locked || !isCurrent ? 'disabled' : ''}>
          ${_esc(exitLabel)}
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
        ${objective ? `<span class="campaign-pill ${objectiveDone ? 'is-current' : 'is-objective'}" title="${_escAttr(objective.questTitle || '')}">${_objectiveIcon(objective)} ${objectiveDone ? '✓ ' : ''}${_esc(objective.label)}</span>` : ''}
      </div>
      <div class="campaign-muted">${_esc(node.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      <div class="campaign-node-actions">
        ${isCurrent ? '<span class="campaign-pill is-current">Current</span>' : `<button class="campaign-action" data-map-move-node="${_escAttr(node.id)}" ${canMove ? '' : 'disabled'}>Move Here</button>`}
        ${captured ? `<span class="campaign-pill is-current">Captured</span>` : ''}
        ${entryResolved && !captured ? `<span class="campaign-pill">Story Resolved</span>` : ''}
        <button class="campaign-action" data-map-reveal-node="${_escAttr(node.id)}">Reveal</button>
        <button class="campaign-action" data-map-clear-node="${_escAttr(node.id)}">Clear</button>
      </div>
      ${node.campfire && isCurrent ? `
        <div class="campaign-node-actions">
          <button class="campaign-action" data-map-camp-rest="1">Camp Rest</button>
          <button class="campaign-action" data-map-open-tab="cook">Cook</button>
          <button class="campaign-action" data-map-open-tab="craft">Craft</button>
          <button class="campaign-action" data-map-open-tab="inventory">Inventory</button>
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

  function renderGridCellDetailSafe(cell, mapState: any = {}) {
    if (!cell) return '<div class="campaign-empty">No current cell.</div>';
    const state = CS().getState();
    const map = CS().getActiveMap();
    const run = state?.activeScenarioRun;
    const activeLevelId = run?.mapLayer || cell.levelId || null;
    const key = _cellKey(cell.x, cell.y, activeLevelId);
    const tags = (cell.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('');
    const objective = cell.questObjective || Runner().objectiveForCell?.(cell, state, map);
    const threat = _movingThreatAt(run, map, cell.x, cell.y, activeLevelId);
    const objectiveDone = objective ? _isObjectiveDone(state, objective) : false;
    const visibleThreats = _visibleLevelThreats(run, map, activeLevelId, mapState, cell);
    const nearbyThreats = visibleThreats
      .filter((t) => t !== threat)
      .map((t) => ({ threat: t, distance: _manhattan(cell, t) }))
      .filter((entry) => entry.distance !== null && entry.distance <= 4)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
    const hiddenNearbyCount = _activeLevelThreats(run, map, activeLevelId)
      .filter((t) => t !== threat && !visibleThreats.includes(t))
      .map((t) => _manhattan(cell, t))
      .filter((distance) => distance !== null && distance <= 3)
      .length;
    const threatReadout = threat
      ? `<div class="campaign-threat-readout is-on-cell mode-${_escAttr(_threatModeKey(threat))}">
          <strong>${_esc(threat.label || threat.id || 'Roamer')}</strong>
          <span>shares this cell — combat triggers on contact (${_esc(_threatModeText(_threatModeKey(threat)))})</span>
        </div>`
      : '';
    const nearbyReadout = nearbyThreats.length
      ? `<div class="campaign-threat-nearby">
          <div class="campaign-section-label">Roamers Nearby</div>
          ${nearbyThreats.map((entry) => {
            const mode = _threatModeKey(entry.threat);
            return `<div class="campaign-threat-nearby-item mode-${_escAttr(mode)}">
              <span class="campaign-threat-nearby-dot mode-${_escAttr(mode)}"></span>
              <b>${_esc(_shortLabel(entry.threat.label || entry.threat.id || 'Roamer', 16))}</b>
              <em>${_esc(_threatModeText(mode))}</em>
              <span class="campaign-threat-nearby-dist">${entry.distance} step${entry.distance === 1 ? '' : 's'}</span>
            </div>`;
          }).join('')}
        </div>`
      : '';
    const fogReadout = hiddenNearbyCount
      ? `<div class="campaign-threat-nearby is-fogged">
          <div class="campaign-section-label">Fog Signs</div>
          <div class="campaign-threat-nearby-item mode-static">
            <span class="campaign-threat-nearby-dot mode-static"></span>
            <b>Movement signs</b>
            <em>nearby, exact source hidden</em>
          </div>
        </div>`
      : '';
    return `
      <div class="campaign-detail-title">
        <span>${_esc(cell.title || key)}</span>
        <span class="campaign-pill">${_esc(cell.kind || 'floor')}</span>
        ${objective ? `<span class="campaign-pill ${objectiveDone ? 'is-current' : 'is-objective'}" title="${_escAttr(objective.questTitle || '')}">${_objectiveIcon(objective)} ${objectiveDone ? '✓ ' : ''}${_esc(objective.label)}</span>` : ''}
        ${threat ? `<span class="campaign-pill is-objective" title="${_escAttr(_threatModeText(_threatModeKey(threat)))}">${_esc(threat.icon || '!')} ${_esc(threat.label || threat.id)}</span>` : ''}
      </div>
      <div class="campaign-muted">${_esc(cell.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      ${threatReadout}
      ${nearbyReadout}
      ${fogReadout}
      <div class="campaign-node-actions">
        <span class="campaign-pill is-current">Current ${_esc(key)}</span>
        ${cell.levelName ? `<span class="campaign-pill">${_esc(cell.levelName)}</span>` : ''}
        ${cell.nextLevelId ? `<span class="campaign-pill">Leads to ${_esc(cell.nextLevelId.replace(/_/g, ' '))}</span>` : ''}
        ${mapState.clearedCells?.[key] ? '<span class="campaign-pill">Cleared</span>' : ''}
      </div>
    `;
  }

  function renderNodeDetailSafe(node, mapState: any = {}) {
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
        <button class="campaign-action" data-map-move-node="${_escAttr(exit.to)}" ${locked || !isCurrent ? 'disabled' : ''}>
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
        ${objective ? `<span class="campaign-pill ${objectiveDone ? 'is-current' : 'is-objective'}" title="${_escAttr(objective.questTitle || '')}">${_objectiveIcon(objective)} ${objectiveDone ? '✓ ' : ''}${_esc(objective.label)}</span>` : ''}
      </div>
      <div class="campaign-muted">${_esc(node.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      <div class="campaign-node-actions">
        ${isCurrent ? '<span class="campaign-pill is-current">Current</span>' : `<button class="campaign-action" data-map-move-node="${_escAttr(node.id)}" ${canMove ? '' : 'disabled'}>Move Here</button>`}
        ${captured ? `<span class="campaign-pill is-current">Captured</span>` : ''}
        ${entryResolved && !captured ? `<span class="campaign-pill">Story Resolved</span>` : ''}
        <button class="campaign-action" data-map-reveal-node="${_escAttr(node.id)}">Reveal</button>
        <button class="campaign-action" data-map-clear-node="${_escAttr(node.id)}">Clear</button>
      </div>
      ${node.campfire && isCurrent ? `
        <div class="campaign-node-actions">
          <button class="campaign-action" data-map-camp-rest="1">Camp Rest</button>
          <button class="campaign-action" data-map-open-tab="cook">Cook</button>
          <button class="campaign-action" data-map-open-tab="craft">Craft</button>
          <button class="campaign-action" data-map-open-tab="inventory">Inventory</button>
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

  function _nodeIconSymbolId(node: any = {}) {
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

  function _mapTheme(map: any = {}) {
    const w = String(map.theme || map.world || CS().getState()?.currentWorld || '').toLowerCase();
    if (w.includes('haven')) return 'haven';
    if (w.includes('zombie') || w.includes('rot')) return 'zombie';
    return '';
  }

  // Returns the path to a per-setting background SVG used in the node-map
  // canvas <image>. Returns an empty string if no art is available for the
  // setting, in which case the renderer falls back to gradient backgrounds.
  function _settingBackgroundHref(setting) {
    const key = String(setting || '').toLowerCase();
    const MAP = {
      forest: 'assets/decorations/node_bg_forest.svg',
      outdoor: 'assets/decorations/node_bg_forest.svg',
      snowfield: 'assets/decorations/node_bg_mountain.svg',
      mountain: 'assets/decorations/node_bg_mountain.svg',
      urban: 'assets/decorations/node_bg_urban.svg',
      dungeon: 'assets/decorations/node_bg_dungeon.svg',
      castle: 'assets/decorations/node_bg_dungeon.svg',
      arena: 'assets/decorations/node_bg_dungeon.svg',
      cave: 'assets/decorations/node_bg_cave.svg',
      volcano: 'assets/decorations/node_bg_cave.svg',
      sewer: 'assets/decorations/node_bg_sewer.svg',
      ruins: 'assets/decorations/node_bg_ruins.svg',
      temple: 'assets/decorations/node_bg_ruins.svg',
      house: 'assets/decorations/node_bg_house.svg',
      tavern: 'assets/decorations/node_bg_tavern.svg',
      desert: 'assets/decorations/node_bg_ruins.svg',
      swamp: 'assets/decorations/node_bg_forest.svg'
    };
    return MAP[key] || '';
  }

  // Per-setting SVG defs that get injected into the node-map <defs>. Used to
  // hold gradients/patterns referenced by the per-setting overlay rect.
  function _nodeMapBackgroundDefs(setting) {
    const stops = _settingOverlayStops(setting);
    return `
      <linearGradient id="cjs-map-bg-overlay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${stops.top}" stop-opacity="${stops.topAlpha}"/>
        <stop offset="0.55" stop-color="${stops.mid}" stop-opacity="${stops.midAlpha}"/>
        <stop offset="1" stop-color="${stops.bot}" stop-opacity="${stops.botAlpha}"/>
      </linearGradient>
    `;
  }

  function _settingOverlayStops(setting) {
    const key = String(setting || '').toLowerCase();
    switch (key) {
      case 'forest':
      case 'outdoor':
        return { top: '#0c1b12', topAlpha: 0.18, mid: '#0c1b12', midAlpha: 0.08, bot: '#040806', botAlpha: 0.35 };
      case 'snowfield':
      case 'mountain':
        return { top: '#082236', topAlpha: 0.22, mid: '#0a1626', midAlpha: 0.08, bot: '#03060a', botAlpha: 0.42 };
      case 'urban':
        return { top: '#170f24', topAlpha: 0.28, mid: '#170f24', midAlpha: 0.1, bot: '#06030d', botAlpha: 0.45 };
      case 'dungeon':
      case 'castle':
      case 'arena':
        return { top: '#110e15', topAlpha: 0.32, mid: '#0a0a0e', midAlpha: 0.12, bot: '#020203', botAlpha: 0.55 };
      case 'cave':
      case 'volcano':
        return { top: '#1a1108', topAlpha: 0.28, mid: '#0c0703', midAlpha: 0.1, bot: '#000000', botAlpha: 0.5 };
      case 'sewer':
        return { top: '#12200c', topAlpha: 0.28, mid: '#091308', midAlpha: 0.1, bot: '#020401', botAlpha: 0.5 };
      case 'ruins':
      case 'temple':
      case 'desert':
        return { top: '#1d1808', topAlpha: 0.22, mid: '#100c05', midAlpha: 0.1, bot: '#050402', botAlpha: 0.4 };
      case 'house':
      case 'tavern':
        return { top: '#1d130a', topAlpha: 0.24, mid: '#0d0805', midAlpha: 0.1, bot: '#050201', botAlpha: 0.45 };
      case 'swamp':
        return { top: '#0b1908', topAlpha: 0.28, mid: '#070d04', midAlpha: 0.12, bot: '#010301', botAlpha: 0.5 };
      default:
        return { top: '#0a1219', topAlpha: 0.2, mid: '#06090e', midAlpha: 0.1, bot: '#020306', botAlpha: 0.4 };
    }
  }

  function _objectiveIcon(objective: any = {}) {
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

  function _objectiveTag(objective: any = {}) {
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

  // Compute the SVG viewBox dimensions for a node map. Prefers explicit
  // canvasWidth/Height (set by the generator). Otherwise falls back to the
  // smallest box that fits every node's x/y, with a minimum of 680x420.
  function _nodeCanvasSize(map: any = {}) {
    const w = Number(map.canvasWidth || 0);
    const h = Number(map.canvasHeight || 0);
    if (w >= 200 && h >= 200) return { width: w, height: h };
    let maxX = 0;
    let maxY = 0;
    for (const node of map.nodes || []) {
      const nx = Number(node.x);
      const ny = Number(node.y);
      if (Number.isFinite(nx) && nx > maxX) maxX = nx;
      if (Number.isFinite(ny) && ny > maxY) maxY = ny;
    }
    return {
      width: Math.max(680, Math.round(maxX + 80)),
      height: Math.max(420, Math.round(maxY + 80))
    };
  }

  function _renderLayerTabs(layers, activeLayer) {
    if (layers.length <= 1) return '';
    return `
      <div class="campaign-map-layers" role="tablist" aria-label="Map layers">
        ${layers.map((layer) => `
          <button class="campaign-map-layer ${layer.id === activeLayer ? 'is-active' : ''}" data-map-layer="${_escAttr(layer.id)}" role="tab" aria-selected="${layer.id === activeLayer ? 'true' : 'false'}">
            ${_esc(layer.name)}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _mapMeta(map, visible, revealed) {
    const parts = [];
    if (map._procedural || map._generated) parts.push('Procedural');
    if (map.setting) parts.push(_titleSetting(map.setting));
    if (map.size) parts.push(_titleCaseWord(map.size));
    parts.push(`${visible}/${revealed} shown`);
    return parts.join(' | ');
  }

  function _gridMeta(map, run, width, height) {
    const parts = [];
    if (map.setting) parts.push(_titleSetting(map.setting));
    if (map.size) parts.push(_titleCaseWord(map.size));
    const levelName = Runner().findCurrentCell?.()?.levelName;
    if (levelName) parts.push(levelName);
    parts.push(`${width}x${height}`);
    parts.push(`${(run.visitedCells || []).length} visited`);
    const threats = Array.isArray(run.movingThreats) ? run.movingThreats.length : 0;
    if (threats) parts.push(`${threats} threat${threats === 1 ? '' : 's'}`);
    return parts.join(' | ');
  }

  function _titleSetting(value) {
    const text = String(value || '').replace(/_/g, ' ');
    return text.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  function _titleCaseWord(value) {
    const text = String(value || '');
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function _nodeLayer(node) {
    return _normalizeLayerId(node?.layer || node?.layerId || 'layer_1');
  }

  function _normalizeLayerId(value) {
    return String(value || 'layer_1').replace(/\s+/g, '_').toLowerCase();
  }

  function _shortLabel(value, max = 18) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, Math.max(2, max - 2))}..` : text;
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

  function _terrainAt(map, x, y, levelId = null) {
    const effectiveLevelId = levelId || CS().getState()?.activeScenarioRun?.mapLayer || null;
    const levels = Array.isArray(map?.levels) ? map.levels : [];
    const level = levels.find((entry) => _normalizeLayerId(entry.id || entry.layerId || 'level_1') === _normalizeLayerId(effectiveLevelId || map.defaultLevelId || 'level_1')) || levels[0] || null;
    const row = level?.terrain?.[Number(y)] || level?.grid?.[Number(y)] || map.terrain?.[Number(y)] || map.grid?.[Number(y)];
    return row?.[Number(x)] || 'floor';
  }

  function _cellPassable(map, x, y, levelId = null) {
    return !['wall', 'obstacle', 'blocked', 'void', 'rock', 'pillar'].includes(String(_terrainAt(map, x, y, levelId)).toLowerCase());
  }

  function _movingThreatAt(run, map, x, y, levelId = null) {
    if (!run || !Array.isArray(run.movingThreats)) return null;
    const key = _cellKey(x, y, levelId);
    return run.movingThreats.find((threat) => _cellKey(threat.x, threat.y, threat.levelId || levelId) === key) || null;
  }

  // levelId arg accepted but only used when it differs from the default level
  // (kept compatible with prior callers that pass map as the 4th arg — we ignore it).
  function _cellKey(x, y, levelId = null, _map?) {
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

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignMap = CampaignMap;
