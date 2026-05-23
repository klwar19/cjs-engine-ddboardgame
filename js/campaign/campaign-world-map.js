// campaign-world-map.js
// Shared travel-map and world-activity renderer for multi-world campaign play.

window.CJS = window.CJS || {};

window.CJS.CampaignWorldMap = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Conditions = () => window.CJS.CampaignConditions;
  const UI = () => window.CJS.UI;

  function renderTravelMap(state = CS().getState()) {
    const map = _currentTravelMap(state);
    const progress = _progress(state);
    if (!map) {
      return `<section class="campaign-panel"><div class="campaign-empty">No travel map for this world yet.</div></section>`;
    }
    if (map.visualMode === 'vn_travel') return _renderVisualTravelMap(map, state, progress);
    return _renderClassicTravelMap(map, state, progress);
  }

  function _renderClassicTravelMap(map, state, progress) {
    const canvas = map.canvas || {};
    const width = Number(canvas.width || map.width || 720);
    const height = Number(canvas.height || map.height || 420);
    const theme = _slug(map.visualTheme?.id || map.world || 'world');
    const backdropStyle = _travelMapBackdropStyle(map, state);
    const nodeById = Object.fromEntries((map.nodes || []).map((node) => [node.id, node]));
    const currentId = progress.currentLocation || map.defaultLocationId || map.nodes?.[0]?.id || '';
    const currentNode = nodeById[currentId] || map.nodes?.[0] || null;
    const links = (map.links || []).map((link) => {
      const from = nodeById[link.from];
      const to = nodeById[link.to];
      if (!from || !to) return '';
      return `<line x1="${Number(from.x || 0)}" y1="${Number(from.y || 0)}" x2="${Number(to.x || 0)}" y2="${Number(to.y || 0)}" class="campaign-world-link" />`;
    }).join('');
    const nodes = (map.nodes || []).map((node) => {
      const active = node.id === currentId;
      const visited = (progress.visitedLocations || []).includes(node.id);
      return `<g class="campaign-world-node ${active ? 'is-active' : ''} ${visited ? 'is-visited' : ''}" data-campaign-action="world-map-travel" data-map-id="${_escAttr(map.id)}" data-node-id="${_escAttr(node.id)}" data-world-node="${_escAttr(node.id)}">
        <circle cx="${Number(node.x || 0)}" cy="${Number(node.y || 0)}" r="${active ? 20 : 16}"></circle>
        <text x="${Number(node.x || 0)}" y="${Number(node.y || 0) + 34}" text-anchor="middle">${_esc(_short(node.name || node.id, 18))}</text>
      </g>`;
    }).join('');

    return `
      <section class="campaign-panel campaign-world-map-panel theme-${_escAttr(theme)}"${backdropStyle}>
        <div class="campaign-panel-head">
          <div>
            <h2>${_esc(map.name || 'World Map')}</h2>
            <span class="campaign-muted">${_esc(_worldName(state))} / ${_esc(currentNode?.name || 'No location')}</span>
          </div>
          ${_renderWorldProgress(state)}
        </div>
        <div class="campaign-world-map-layout">
          <svg class="campaign-world-map-canvas" viewBox="0 0 ${width} ${height}" role="img" aria-label="${_escAttr(map.name || map.id)}">
            <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="campaign-world-map-bg"></rect>
            ${links}
            ${nodes}
          </svg>
          <div class="campaign-world-location">
            ${_renderLocationDetail(map, currentNode, progress, state)}
          </div>
        </div>
      </section>
    `;
  }

  function _renderVisualTravelMap(map, state, progress) {
    const canvas = map.canvas || {};
    const width = Number(canvas.width || map.width || 760);
    const height = Number(canvas.height || map.height || 430);
    const nodeById = Object.fromEntries((map.nodes || []).map((node) => [node.id, node]));
    const currentId = nodeById[progress.currentLocation] ? progress.currentLocation : (map.defaultLocationId || map.nodes?.[0]?.id || '');
    const currentNode = nodeById[currentId] || map.nodes?.[0] || null;
    const theme = _slug(map.visualTheme?.id || map.world || 'world');
    const backdropStyle = _travelMapBackdropStyle(map, state);
    const backdropUrl = _travelMapBackdrop(map, state);
    const backdropImage = backdropUrl
      ? `<image class="campaign-world-map-image" href="${_escAttr(_assetUrlForCss(backdropUrl))}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="${_escAttr(map.visualBackdropFit || 'xMidYMid slice')}"></image>
         <rect x="0" y="0" width="${width}" height="${height}" rx="18" class="campaign-world-map-image-shade"></rect>`
      : '';
    const layers = _renderVisualLayers(map);
    const roads = _renderVisualRoads(map, nodeById);
    const nodes = (map.nodes || []).map((node) => _renderVisualNode(map, node, currentId, progress, state, width, height)).join('');

    return `
      <section class="campaign-panel campaign-world-map-panel is-visual-map theme-${_escAttr(theme)}"${backdropStyle}>
        <div class="campaign-panel-head">
          <div>
            <h2>${_esc(map.name || 'World Map')}</h2>
            <span class="campaign-muted">${_esc(_worldName(state))} / ${_esc(currentNode?.name || 'No location')}</span>
          </div>
          ${_renderWorldProgress(state)}
        </div>
        ${_renderAreaButtons(map)}
        <div class="campaign-world-map-layout">
          <div class="campaign-world-map-stage">
            <svg class="campaign-world-map-canvas is-visual" viewBox="0 0 ${width} ${height}" role="img" aria-label="${_escAttr(map.name || map.id)}">
              <rect x="0" y="0" width="${width}" height="${height}" rx="18" class="campaign-world-map-bg"></rect>
              ${backdropImage}
              ${layers}
              ${roads}
              ${nodes}
            </svg>
            ${_renderMapLegend(map)}
          </div>
          <div class="campaign-world-location">
            ${_renderLocationDetail(map, currentNode, progress, state)}
          </div>
        </div>
      </section>
    `;
  }

  function renderActivities(state = CS().getState()) {
    const progress = _progress(state);
    const activities = _visibleActivities(state);
    const grouped = _groupBy(activities, (activity) => activity.type || 'activity');
    const journal = _journalEntries(state);
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <div>
            <h2>${_esc(_worldName(state))} Activities</h2>
            <span class="campaign-muted">${_esc(_locationName(progress.currentLocation) || 'Choose a location on World Map')}</span>
          </div>
          ${_renderPressureStrip(state)}
        </div>
        ${Object.keys(grouped).length ? Object.entries(grouped).map(([type, rows]) => _renderActivityGroup(type, rows, state)).join('') : '<div class="campaign-empty">No activities available at this location.</div>'}
      </section>
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h2>Journal & Recap</h2></div>
        ${journal.map(_renderJournalEntry).join('') || '<div class="campaign-empty">No journal entries yet.</div>'}
      </section>
    `;
  }

  function handleAction(data = {}) {
    switch (data.campaignAction) {
      case 'world-map-travel': return travelToLocation(data.mapId, data.nodeId);
      case 'world-map-switch-map': return switchTravelMap(data.mapId);
      case 'world-map-interaction': return runNodeEntry(data.mapId, data.nodeId, data.entryId, 'people');
      case 'world-map-node-action': return runNodeEntry(data.mapId, data.nodeId, data.entryId, 'actions');
      case 'world-activity-use': return useActivity(data.activityId);
      default: return false;
    }
  }

  function travelToLocation(mapId, nodeId) {
    const state = CS().getState();
    const map = _mapById(mapId) || _currentTravelMap(state);
    const node = (map?.nodes || []).find((entry) => entry.id === nodeId);
    if (!map || !node) return false;
    const progress = _progress(state, map.world || state.currentWorld);
    if (progress.currentLocation === node.id && progress.currentTravelMap === map.id) return true;
    const ops = [
      {
        op: 'travel_location',
        world: map.world || state.currentWorld,
        mapId: map.id,
        locationId: node.id,
        title: node.name || node.id,
        zone: node.zone || map.zone,
        hubId: node.hubId || map.hubId
      },
      ...(node.onTravelOps || [])
    ];
    Ops().apply(ops, { source: 'world_map' });
    _playScene(node.storySceneId);
    return true;
  }

  function switchTravelMap(mapId) {
    const state = CS().getState();
    const map = _mapById(mapId);
    if (!map) return false;
    if (map.world && state.currentWorld && map.world !== state.currentWorld) {
      UI()?.toast?.('That map belongs to another world.', 'info');
      return false;
    }
    const nodeId = map.defaultLocationId || map.nodes?.[0]?.id || null;
    const ops = [{ op: 'world_progress_set', world: map.world || state.currentWorld, currentTravelMap: map.id }];
    if (nodeId) {
      const node = (map.nodes || []).find((entry) => entry.id === nodeId) || {};
      ops.push({
        op: 'travel_location',
        world: map.world || state.currentWorld,
        mapId: map.id,
        locationId: nodeId,
        title: node.name || nodeId,
        zone: node.zone || map.zone,
        hubId: node.hubId || map.hubId
      });
    }
    Ops().apply(ops, { source: 'world_map_switch' });
    return true;
  }

  function runNodeEntry(mapId, nodeId, entryId, bucket) {
    const map = _mapById(mapId) || _currentTravelMap();
    const node = (map?.nodes || []).find((entry) => entry.id === nodeId);
    const entry = (node?.[bucket] || []).find((item) => item.id === entryId);
    if (!entry) return false;
    const cond = _condition(entry.conditions || entry.requires);
    if (!cond.ok) {
      UI()?.toast?.(cond.blockers[0] || 'Not available yet.', 'info');
      return false;
    }
    const ops = [
      ...(entry.ops || []),
      ...(entry.journal ? [{ op: 'journal_entry_add', ...entry.journal }] : [])
    ];
    if (ops.length) Ops().apply(ops, { source: 'world_map_entry' });
    _playScene(entry.storySceneId);
    return true;
  }

  function useActivity(activityId) {
    const activity = _visibleActivities().find((entry) => entry.id === activityId);
    if (!activity) return false;
    const cond = _condition(activity.conditions || activity.requires);
    if (!cond.ok) {
      UI()?.toast?.(cond.blockers[0] || 'Not available yet.', 'info');
      return false;
    }
    const cost = _costOps(activity.cost || activity.inputs || {});
    if (!cost.ok) {
      UI()?.toast?.(`Missing ${cost.missing.join(', ')}`, 'info');
      return false;
    }
    const ops = [
      ...cost.ops,
      ...(activity.ops || []),
      ...(activity.journal ? [{ op: 'journal_entry_add', ...activity.journal }] : []),
      { op: 'world_activity_record', activityId: activity.id, title: activity.title || activity.name, result: 'used' }
    ];
    Ops().apply(ops, { source: 'world_activity' });
    _playScene(activity.storySceneId);
    return true;
  }

  function _renderLocationDetail(map, node, progress, state = CS().getState()) {
    if (!node) return '<div class="campaign-empty">No location selected.</div>';
    const isCurrent = node.id === progress.currentLocation;
    const people = (node.people || []).map((person) => _renderNodeButton('world-map-interaction', map.id, node.id, person)).join('');
    const actions = (node.actions || []).map((action) => _renderNodeButton('world-map-node-action', map.id, node.id, action)).join('');
    const activities = _activitiesForLocation(state, map, node);
    return `
      <div class="campaign-world-location-head">
        <h3>${_esc(node.name || node.id)}</h3>
        <span class="campaign-pill">${_esc(node.type || 'location')}</span>
      </div>
      <p>${_esc(node.description || 'No notes yet.')}</p>
      ${activities.length ? _renderLocationActivityPreview(activities) : '<div class="campaign-muted">No location activities yet. This place can still hold story scenes, people, or future systems.</div>'}
      <div class="campaign-panel-actions">
        <button class="campaign-action primary" data-campaign-action="world-map-travel" data-map-id="${_escAttr(map.id)}" data-node-id="${_escAttr(node.id)}" ${isCurrent ? 'disabled' : ''}>${isCurrent ? 'Here' : 'Travel'}</button>
        ${activities.length ? '<button class="campaign-action" data-campaign-tab="worldActivities">Open Activities</button>' : ''}
      </div>
      ${people ? `<h4>People</h4><div class="campaign-world-action-list">${people}</div>` : ''}
      ${actions ? `<h4>Local Actions</h4><div class="campaign-world-action-list">${actions}</div>` : ''}
    `;
  }

  function _renderLocationActivityPreview(activities) {
    return `
      <div class="campaign-world-location-activities">
        <strong>Available here</strong>
        ${activities.slice(0, 3).map((activity) => `<span>${_esc(activity.title || activity.name || activity.id)}</span>`).join('')}
      </div>
    `;
  }

  function _renderNodeButton(actionName, mapId, nodeId, entry) {
    const cond = _condition(entry.conditions || entry.requires);
    return `
      <button class="campaign-action ${entry.kind === 'primary' ? 'primary' : ''}" data-campaign-action="${actionName}" data-map-id="${_escAttr(mapId)}" data-node-id="${_escAttr(nodeId)}" data-entry-id="${_escAttr(entry.id)}" ${cond.ok ? '' : 'disabled'} title="${_escAttr(cond.ok ? (entry.summary || entry.text || '') : cond.blockers.join(' / '))}">
        ${_esc(entry.label || entry.name || entry.title || entry.id)}
      </button>
    `;
  }

  function _renderAreaButtons(map) {
    const areas = map.areaButtons || map.cities || [];
    if (!areas.length) return '';
    const buttons = areas.map((area) => {
      const active = area.mapId === map.id || area.active === true;
      const dev = !area.mapId || area.status === 'placeholder' || area.status === 'dev';
      const disabled = active || dev;
      const classes = ['campaign-world-area-btn'];
      if (active) classes.push('is-active');
      if (dev) classes.push('is-dev');
      const attrs = disabled
        ? 'disabled'
        : `data-campaign-action="world-map-switch-map" data-map-id="${_escAttr(area.mapId)}"`;
      return `<button class="${classes.join(' ')}" ${attrs} title="${_escAttr(area.summary || area.description || '')}">
        <span>${_esc(area.label || area.name || area.id)}</span>
        <small>${_esc(active ? 'Current' : (dev ? 'Future' : 'Travel'))}</small>
      </button>`;
    }).join('');
    const devNotes = areas
      .filter((area) => !area.mapId || area.status === 'placeholder' || area.status === 'dev')
      .map((area) => `<span><strong>${_esc(area.label || area.name || area.id)}:</strong> ${_esc(area.summary || area.description || 'Planned for a later update.')}</span>`)
      .join('');
    return `
      <div class="campaign-world-area-switcher">
        ${buttons}
      </div>
      ${devNotes ? `<div class="campaign-world-dev-notes">${devNotes}</div>` : ''}
    `;
  }

  function _renderVisualLayers(map) {
    return (map.visualLayers || []).map((layer) => {
      const cls = _layerClass(layer);
      const common = `class="${_escAttr(cls)}"`;
      switch (layer.type) {
        case 'rect':
          return `<rect ${common} x="${Number(layer.x || 0)}" y="${Number(layer.y || 0)}" width="${Number(layer.width || layer.w || 0)}" height="${Number(layer.height || layer.h || 0)}" rx="${Number(layer.rx || 0)}"></rect>`;
        case 'ellipse':
          return `<ellipse ${common} cx="${Number(layer.cx || layer.x || 0)}" cy="${Number(layer.cy || layer.y || 0)}" rx="${Number(layer.rx || layer.w || 0)}" ry="${Number(layer.ry || layer.h || 0)}"></ellipse>`;
        case 'line':
          return `<line ${common} x1="${Number(layer.x1 || 0)}" y1="${Number(layer.y1 || 0)}" x2="${Number(layer.x2 || 0)}" y2="${Number(layer.y2 || 0)}"></line>`;
        case 'polygon':
          return `<polygon ${common} points="${_escAttr(layer.points || '')}"></polygon>`;
        case 'polyline':
          return `<polyline ${common} points="${_escAttr(layer.points || '')}"></polyline>`;
        case 'text':
          return `<text ${common} x="${Number(layer.x || 0)}" y="${Number(layer.y || 0)}">${_esc(layer.text || '')}</text>`;
        case 'path':
        default:
          return `<path ${common} d="${_escAttr(layer.d || '')}"></path>`;
      }
    }).join('');
  }

  function _renderVisualRoads(map, nodeById) {
    return (map.links || []).map((link) => {
      const from = nodeById[link.from];
      const to = nodeById[link.to];
      if (!from || !to) return '';
      const midX = (Number(from.x || 0) + Number(to.x || 0)) / 2;
      const midY = (Number(from.y || 0) + Number(to.y || 0)) / 2;
      return `<path d="M ${Number(from.x || 0)} ${Number(from.y || 0)} Q ${midX} ${midY} ${Number(to.x || 0)} ${Number(to.y || 0)}" class="campaign-world-road route-${_escAttr(_slug(link.route || 'road'))} risk-${_escAttr(_slug(link.risk || 'safe'))}"></path>`;
    }).join('');
  }

  function _renderVisualNode(map, node, currentId, progress, state, width, height) {
    const active = node.id === currentId;
    const visited = (progress.visitedLocations || []).includes(node.id);
    const shape = _slug(node.visual?.shape || node.type || 'location');
    const activities = _activitiesForLocation(state, map, node);
    const x = Number(node.x || 0);
    const y = Number(node.y || 0);
    const previewX = Math.min(Math.max(x + 18, 12), Math.max(12, width - 226));
    const previewY = Math.min(Math.max(y - 112, 12), Math.max(12, height - 108));
    const visual = node.visual || {};
    const label = _nodeLabelPosition(node, x, y, width, map);
    const markerScale = _scaleValue(active
      ? (visual.activeMarkerScale ?? map.visualActiveMarkerScale ?? visual.markerScale ?? map.visualMarkerScale)
      : (visual.markerScale ?? map.visualMarkerScale), 1);
    const markerOpacity = _opacityAttr(active
      ? (visual.activeMarkerOpacity ?? map.visualActiveMarkerOpacity ?? visual.markerOpacity ?? map.visualMarkerOpacity)
      : (visual.markerOpacity ?? map.visualMarkerOpacity));
    const labelScale = _scaleValue(active
      ? (visual.activeLabelScale ?? map.visualActiveLabelScale ?? visual.labelScale ?? map.visualLabelScale)
      : (visual.labelScale ?? map.visualLabelScale), 1);
    const labelOpacity = _opacityAttr(active
      ? (visual.activeLabelOpacity ?? map.visualActiveLabelOpacity ?? visual.labelOpacity ?? map.visualLabelOpacity)
      : (visual.labelOpacity ?? map.visualLabelOpacity));
    const labelHeight = _scaleValue(visual.labelHeight ?? map.visualLabelHeight, 34);
    const markerTransform = _scaleTransform(x, y, markerScale);
    const labelTransform = _scaleTransform(label.x + label.width / 2, label.y + labelHeight / 2, labelScale);
    const activityText = activities.length
      ? `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'} here`
      : 'Story / future activity slot';
    return `<g class="campaign-world-node campaign-world-visual-node is-${_escAttr(shape)} ${active ? 'is-active' : ''} ${visited ? 'is-visited' : ''}" data-campaign-action="world-map-travel" data-map-id="${_escAttr(map.id)}" data-node-id="${_escAttr(node.id)}" data-world-node="${_escAttr(node.id)}">
      <g class="campaign-world-node-marker"${markerTransform}${markerOpacity}>
        ${_renderMarkerShape(shape, x, y, active)}
      </g>
      <foreignObject class="campaign-world-node-label-wrap" x="${label.x}" y="${label.y}" width="${label.width}" height="${labelHeight}"${labelTransform}${labelOpacity}>
        <div xmlns="http://www.w3.org/1999/xhtml" class="campaign-world-node-label-box">${_esc(_short(node.name || node.id, 24))}</div>
      </foreignObject>
      <foreignObject class="campaign-world-node-preview-wrap" x="${previewX}" y="${previewY}" width="214" height="98">
        <div xmlns="http://www.w3.org/1999/xhtml" class="campaign-world-node-preview">
          <strong>${_esc(node.name || node.id)}</strong>
          <span>${_esc(node.description || 'No notes yet.')}</span>
          <em>${_esc(activityText)}</em>
        </div>
      </foreignObject>
    </g>`;
  }

  function _nodeLabelPosition(node = {}, x = 0, y = 0, width = 760, map = {}) {
    const visual = node.visual || {};
    const labelWidth = Number(visual.labelWidth || node.labelWidth || map.visualLabelWidth || 148);
    const dx = Number(visual.labelDx ?? node.labelDx ?? 0);
    const dy = Number(visual.labelDy ?? node.labelDy ?? 34);
    const rawX = visual.labelX ?? node.labelX;
    const rawY = visual.labelY ?? node.labelY;
    const labelX = rawX != null ? Number(rawX) : x + dx - labelWidth / 2;
    const labelY = rawY != null ? Number(rawY) : y + dy;
    return {
      x: Math.min(Math.max(labelX, 8), Math.max(8, Number(width || 760) - labelWidth - 8)),
      y: Math.max(8, labelY),
      width: labelWidth
    };
  }

  function _scaleValue(value, fallback = 1) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
  }

  function _opacityAttr(value) {
    if (value == null) return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return ` opacity="${Math.min(1, Math.max(0, num))}"`;
  }

  function _scaleTransform(cx, cy, scale = 1) {
    if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.001) return '';
    return ` transform="translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})"`;
  }

  function _renderMarkerShape(shape, x, y, active) {
    const w = active ? 74 : 66;
    const h = active ? 52 : 46;
    const left = x - w / 2;
    const top = y - h / 2;
    switch (shape) {
      case 'home':
      case 'apartment':
        return `<rect class="node-building node-building-main" x="${left}" y="${top + 11}" width="${w}" height="${h - 6}" rx="5"></rect>
          <polygon class="node-building node-building-roof" points="${x},${top} ${left + w},${top + 18} ${left},${top + 18}"></polygon>
          <rect class="node-window" x="${left + 13}" y="${top + 24}" width="10" height="10"></rect>
          <rect class="node-window" x="${left + w - 23}" y="${top + 24}" width="10" height="10"></rect>`;
      case 'campus':
        return `<rect class="node-building node-building-main" x="${left}" y="${top + 12}" width="${w}" height="${h - 10}" rx="4"></rect>
          <polygon class="node-building node-building-roof" points="${left + 6},${top + 15} ${x},${top} ${left + w - 6},${top + 15}"></polygon>
          <line class="node-column" x1="${left + 17}" y1="${top + 21}" x2="${left + 17}" y2="${top + h - 3}"></line>
          <line class="node-column" x1="${x}" y1="${top + 21}" x2="${x}" y2="${top + h - 3}"></line>
          <line class="node-column" x1="${left + w - 17}" y1="${top + 21}" x2="${left + w - 17}" y2="${top + h - 3}"></line>`;
      case 'hospital':
      case 'medical':
      case 'clinic':
        return `<rect class="node-building node-building-main" x="${left}" y="${top}" width="${w}" height="${h}" rx="7"></rect>
          <rect class="node-plus" x="${x - 6}" y="${top + 12}" width="12" height="${h - 24}"></rect>
          <rect class="node-plus" x="${left + 15}" y="${y - 6}" width="${w - 30}" height="12"></rect>`;
      case 'bookstore':
        return `<rect class="node-building node-building-main" x="${left}" y="${top + 4}" width="${w}" height="${h}" rx="5"></rect>
          <rect class="node-awning" x="${left + 6}" y="${top + 8}" width="${w - 12}" height="9"></rect>
          <line class="node-column" x1="${left + 18}" y1="${top + 20}" x2="${left + 18}" y2="${top + h - 2}"></line>
          <line class="node-column" x1="${left + w - 18}" y1="${top + 20}" x2="${left + w - 18}" y2="${top + h - 2}"></line>`;
      case 'street':
      case 'route':
      case 'subway':
        return `<circle class="node-route-ring" cx="${x}" cy="${y}" r="${active ? 28 : 24}"></circle>
          <path class="node-route-line" d="M ${x - 23} ${y + 5} C ${x - 8} ${y - 13}, ${x + 8} ${y + 19}, ${x + 24} ${y}"></path>
          <circle class="node-route-dot" cx="${x}" cy="${y}" r="5"></circle>`;
      case 'base':
      case 'safehouse':
        return `<rect class="node-building node-building-main" x="${left}" y="${top + 8}" width="${w}" height="${h - 2}" rx="6"></rect>
          <path class="node-tarp" d="M ${left + 3} ${top + 17} L ${x - 6} ${top + 2} L ${left + w - 3} ${top + 17} Z"></path>
          <rect class="node-window" x="${x - 5}" y="${y + 1}" width="10" height="14"></rect>`;
      case 'scavenge':
      case 'mall':
        return `<rect class="node-building node-building-main" x="${left}" y="${top + 6}" width="${w}" height="${h}" rx="6"></rect>
          <rect class="node-awning" x="${left + 5}" y="${top + 10}" width="${w - 10}" height="11"></rect>
          <rect class="node-window" x="${left + 12}" y="${top + 27}" width="14" height="12"></rect>
          <rect class="node-window" x="${left + w - 26}" y="${top + 27}" width="14" height="12"></rect>`;
      case 'objective':
      case 'tower':
        return `<path class="node-tower" d="M ${x} ${top} L ${left + w - 10} ${top + h} L ${left + 10} ${top + h} Z"></path>
          <line class="node-column" x1="${x}" y1="${top + 8}" x2="${x}" y2="${top + h}"></line>
          <circle class="node-beacon" cx="${x}" cy="${top + 5}" r="8"></circle>`;
      default:
        return `<circle class="node-route-ring" cx="${x}" cy="${y}" r="${active ? 25 : 21}"></circle>
          <circle class="node-route-dot" cx="${x}" cy="${y}" r="9"></circle>`;
    }
  }

  function _renderMapLegend(map) {
    const items = map.legend || [];
    if (!items.length) return '';
    return `<div class="campaign-world-map-legend">${items.map((item) => `<span><i class="legend-dot ${_escAttr(_slug(item.kind || item.id || 'dot'))}"></i>${_esc(item.label || item.name || item.id)}</span>`).join('')}</div>`;
  }

  function _renderActivityGroup(type, rows, state) {
    const label = {
      hospital: 'Hospital',
      journal: 'Journal',
      arena: 'Arena',
      auction: 'Auction House',
      scavenge: 'Scavenge',
      build: 'Build'
    }[type] || _title(type);
    return `
      <div class="campaign-world-activity-group">
        <h3>${_esc(label)}</h3>
        <div class="campaign-tab-grid">
          ${rows.map((activity) => _renderActivityCard(activity, state)).join('')}
        </div>
      </div>
    `;
  }

  function _renderActivityCard(activity, state) {
    const cond = _condition(activity.conditions || activity.requires, state);
    const cost = _costOps(activity.cost || activity.inputs || {}, state);
    const ready = cond.ok && cost.ok;
    const record = _progress(state, activity.world).activities?.[activity.id] || {};
    return `
      <article class="campaign-card">
        <div class="campaign-card-head">
          <h3>${_esc(activity.title || activity.name || activity.id)}</h3>
          <span class="campaign-pill">${_esc(record.count ? `Used ${record.count}` : activity.type || 'activity')}</span>
        </div>
        <p>${_esc(activity.summary || activity.description || '')}</p>
        ${activity.rewardText ? `<div class="campaign-muted">${_esc(activity.rewardText)}</div>` : ''}
        ${_costText(activity.cost || activity.inputs) ? `<div class="campaign-muted">Cost: ${_esc(_costText(activity.cost || activity.inputs))}</div>` : ''}
        <div class="campaign-panel-actions">
          <button class="campaign-action primary" data-campaign-action="world-activity-use" data-activity-id="${_escAttr(activity.id)}" ${ready ? '' : 'disabled'} title="${_escAttr(ready ? 'Run activity' : [...cond.blockers, ...cost.missing].join(' / '))}">${_esc(activity.buttonLabel || 'Use')}</button>
        </div>
      </article>
    `;
  }

  function _renderJournalEntry(entry) {
    return `
      <div class="campaign-record-line">
        <div>
          <strong>${_esc(entry.title || entry.id)}</strong>
          <small>${_esc([entry.world, entry.scope].filter(Boolean).join(' / '))}</small>
          <p>${_esc(entry.text || entry.summary || '')}</p>
        </div>
      </div>
    `;
  }

  function _renderWorldProgress(state) {
    const progress = _progress(state);
    return `<div class="campaign-panel-actions">
      <span class="campaign-pill">Zone ${_esc(progress.currentZone || 'new')}</span>
      <span class="campaign-pill">Visited ${(progress.visitedLocations || []).length}</span>
    </div>`;
  }

  function _renderPressureStrip(state) {
    const pressures = Object.values(state.crossWorld?.pressures || {});
    if (!pressures.length) return '';
    return `<div class="campaign-panel-actions">${pressures.slice(0, 4).map((p) => `<span class="campaign-pill">${_esc(p.title || p.id)} ${Number(p.value || 0)}</span>`).join('')}</div>`;
  }

  function _currentTravelMap(state = CS().getState()) {
    const progress = _progress(state);
    return _mapById(progress.currentTravelMap)
      || Loader()?.getTravelMap?.(null, state?.currentWorld, progress.currentZone, progress.currentHub)
      || DS().getAllAsArray('travelMaps').find((map) => map.world === state?.currentWorld)
      || null;
  }

  function _mapById(mapId) {
    return mapId ? DS().get('travelMaps', mapId) : null;
  }

  function _visibleActivities(state = CS().getState()) {
    const progress = _progress(state);
    const locationId = progress.currentLocation;
    return (Loader()?.getWorldActivities?.(state?.currentWorld, progress.currentZone, progress.currentHub) || [])
      .filter((activity) => !activity.locationIds?.length || activity.locationIds.includes(locationId))
      .filter((activity) => activity.type !== 'journal') || [];
  }

  function _journalEntries(state = CS().getState()) {
    const progress = _progress(state);
    const packEntries = (Loader()?.getWorldActivityPacks?.(state?.currentWorld, progress.currentZone, progress.currentHub) || [])
      .flatMap((pack) => [
        ...(pack.journalEntries || []),
        ...(pack.activities || []).filter((activity) => activity.type === 'journal')
      ])
      .filter((entry) => _condition(entry.conditions || entry.requires, state).ok)
      .map((entry) => ({ ...entry, world: entry.world || state.currentWorld, scope: entry.scope || 'world' }));
    return [
      ...packEntries,
      ...(state.crossWorld?.journal || []).slice(0, 12)
    ];
  }

  function _activitiesForLocation(state, map, node) {
    if (!map || !node) return [];
    const worldId = map.world || state?.currentWorld;
    const zoneId = node.zone || map.zone || _progress(state, worldId).currentZone;
    const hubId = node.hubId || map.hubId || _progress(state, worldId).currentHub;
    return (Loader()?.getWorldActivities?.(worldId, zoneId, hubId) || [])
      .filter((activity) => activity.type !== 'journal')
      .filter((activity) => !activity.locationIds?.length || activity.locationIds.includes(node.id));
  }

  function _progress(state = CS().getState(), worldId = state?.currentWorld) {
    const id = worldId || state?.currentWorld || 'haven';
    return state?.worldProgress?.[id] || {};
  }

  function _condition(conditions, state = CS().getState()) {
    if (!conditions || !Object.keys(conditions || {}).length) return { ok: true, blockers: [], reasons: [] };
    return Conditions()?.evaluate?.(conditions, state) || { ok: true, blockers: [], reasons: [] };
  }

  function _costOps(cost, state = CS().getState()) {
    const ops = [];
    const missing = [];
    const inv = state?.inventory || {};
    for (const bucket of ['items', 'materials', 'food', 'questItems']) {
      for (const [id, qty] of Object.entries(cost?.[bucket] || {})) {
        const have = Number(inv[bucket]?.[id] || 0);
        const need = Number(qty || 0);
        if (have < need) missing.push(`${id} x${need}`);
        else ops.push({ op: _takeOp(bucket), id, qty: need });
      }
    }
    for (const [currency, amount] of Object.entries(cost?.currencies || {})) {
      const have = Number(state?.currencies?.[currency] || 0);
      const need = Number(amount || 0);
      if (have < need) missing.push(`${currency} ${need}`);
      else ops.push({ op: 'take_money', currency, amount: need });
    }
    const imports = cost?.imports || cost?.crossWorld || {};
    const importStore = state?.crossWorld?.imports || {};
    for (const bucket of ['items', 'materials', 'food', 'questItems']) {
      for (const [id, qty] of Object.entries(imports?.[bucket] || {})) {
        const have = Number(importStore[bucket]?.[id] || 0);
        const need = Number(qty || 0);
        if (have < need) missing.push(`import ${id} x${need}`);
        else ops.push({ op: 'cross_import_take', bucket, id, qty: need });
      }
    }
    for (const [currency, amount] of Object.entries(imports?.currencies || {})) {
      const have = Number(importStore.currencies?.[currency] || 0);
      const need = Number(amount || 0);
      if (have < need) missing.push(`import ${currency} ${need}`);
      else ops.push({ op: 'cross_import_take', bucket: 'currencies', currency, amount: need });
    }
    return { ok: missing.length === 0, missing, ops };
  }

  function _takeOp(bucket) {
    return {
      items: 'take_item',
      materials: 'take_material',
      food: 'take_food',
      questItems: 'take_quest_item'
    }[bucket] || 'take_item';
  }

  function _costText(cost = {}) {
    const parts = [];
    for (const bucket of ['items', 'materials', 'food', 'questItems']) {
      for (const [id, qty] of Object.entries(cost[bucket] || {})) parts.push(`${id} x${qty}`);
    }
    for (const [id, qty] of Object.entries(cost.currencies || {})) parts.push(`${id} ${qty}`);
    const imports = cost.imports || cost.crossWorld || {};
    for (const bucket of ['items', 'materials', 'food', 'questItems']) {
      for (const [id, qty] of Object.entries(imports[bucket] || {})) parts.push(`import ${id} x${qty}`);
    }
    for (const [id, qty] of Object.entries(imports.currencies || {})) parts.push(`import ${id} ${qty}`);
    return parts.join(', ');
  }

  function _playScene(sceneId) {
    if (sceneId) window.CJS.CampaignStoryScenes?.playSceneById?.(sceneId, { forceFullscreen: true });
  }

  function _locationName(locationId) {
    if (!locationId) return '';
    for (const map of DS().getAllAsArray('travelMaps')) {
      const node = (map.nodes || []).find((entry) => entry.id === locationId);
      if (node) return node.name || node.id;
    }
    return locationId;
  }

  function _worldName(state = CS().getState()) {
    const world = DS().get('worlds', state?.currentWorld);
    return world?.displayName || state?.currentWorld || 'World';
  }

  function _groupBy(items, keyFn) {
    return (items || []).reduce((out, item) => {
      const key = keyFn(item);
      out[key] = out[key] || [];
      out[key].push(item);
      return out;
    }, {});
  }

  function _layerClass(layer = {}) {
    const parts = ['campaign-world-layer'];
    if (layer.kind) parts.push(`layer-${_slug(layer.kind)}`);
    if (layer.className) parts.push(...String(layer.className).split(/\s+/).filter(Boolean).map(_slug));
    if (layer.type) parts.push(`layer-type-${_slug(layer.type)}`);
    return parts.join(' ');
  }

  function _travelMapBackdropStyle(map = {}, state = {}) {
    const backdrop = _travelMapBackdrop(map, state);
    return backdrop ? ` style="--world-map-backdrop: url('${_escAttr(_assetUrlForCss(backdrop))}')"` : '';
  }

  function _travelMapBackdrop(map = {}, state = {}) {
    const worldId = map.world || state.currentWorld || '';
    const world = DS().get('worlds', worldId) || {};
    const theme = world.storyModeTheme || {};
    return map.visualBackdrop || theme.mapBackdrop || theme.homeBackdrop || theme.bannerImage || theme.backdrop || '';
  }

  function _assetUrlForCss(path = '') {
    const text = String(path || '').trim();
    if (!text) return '';
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(text)) return text;
    return text.replace(/^\.?\//, '');
  }

  function _title(value) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function _slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  function _short(value, max = 24) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) {
    return _esc(value);
  }

  return Object.freeze({
    renderTravelMap,
    renderActivities,
    handleAction,
    travelToLocation,
    useActivity
  });
})();
