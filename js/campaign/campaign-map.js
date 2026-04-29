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

    const mapState = state.mapState[map.id] || { revealed: {}, visited: {}, locked: {}, cleared: {} };
    const nodes = (map.nodes || []).filter((node) => node.discoveredByDefault || mapState.revealed?.[node.id] || run.revealedNodes?.includes(node.id));
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
      return `
        <g class="campaign-map-node ${active ? 'is-active' : ''} ${visited ? 'is-visited' : ''} ${locked ? 'is-locked' : ''}" data-node-id="${_escAttr(node.id)}" tabindex="0">
          <circle cx="${node.x}" cy="${node.y}" r="${active ? 20 : 16}"></circle>
          <text x="${node.x}" y="${node.y + 4}" text-anchor="middle">${_nodeIcon(node)}</text>
        </g>
      `;
    }).join('');

    const current = Runner().findCurrentNode();
    container.innerHTML = `
      <div class="campaign-map-shell">
        <svg class="campaign-map-canvas" viewBox="0 0 ${width} ${height}" role="img" aria-label="${_escAttr(map.name || map.id)}">
          <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="campaign-map-bg"></rect>
          ${lines.join('')}
          ${nodeMarkup}
        </svg>
        <div class="campaign-node-detail">
          ${renderNodeDetail(current, mapState)}
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

  function renderSelectedNode(container, nodeId) {
    const map = CS().getActiveMap();
    const state = CS().getState();
    const node = Runner().findNode(map, nodeId);
    const detail = container.querySelector('.campaign-node-detail');
    if (detail) detail.innerHTML = renderNodeDetail(node, state.mapState[map.id] || {});
  }

  function renderNodeDetail(node, mapState = {}) {
    if (!node) return '<div class="campaign-empty">Select a node.</div>';
    const run = CS().getState()?.activeScenarioRun;
    const exits = (node.exits || []).map((exit) => {
      const target = Runner().findNode(CS().getActiveMap(), exit.to);
      const locked = mapState.locked?.[exit.to] || exit.locked;
      return `
        <button class="campaign-action" data-campaign-action="move-node" data-node-id="${_escAttr(exit.to)}" ${locked ? 'disabled' : ''}>
          ${_esc(exit.label || target?.title || exit.to)}
        </button>
      `;
    }).join('');

    const tags = (node.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('');
    const isCurrent = run?.currentNode === node.id;
    return `
      <div class="campaign-detail-title">
        <span>${_esc(node.title || node.id)}</span>
        <span class="campaign-pill">${_esc(node.kind || 'node')}</span>
      </div>
      <div class="campaign-muted">${_esc(node.notes || '')}</div>
      <div class="campaign-chip-row">${tags}</div>
      <div class="campaign-node-actions">
        ${isCurrent ? '<span class="campaign-pill is-current">Current</span>' : `<button class="campaign-action" data-campaign-action="move-node" data-node-id="${_escAttr(node.id)}">Move Here</button>`}
        <button class="campaign-action" data-campaign-action="reveal-node" data-node-id="${_escAttr(node.id)}">Reveal</button>
        <button class="campaign-action" data-campaign-action="clear-node" data-node-id="${_escAttr(node.id)}">Clear</button>
      </div>
      ${exits ? `<div class="campaign-link-list"><div class="campaign-section-label">Exits</div>${exits}</div>` : '<div class="campaign-empty">No exits.</div>'}
    `;
  }

  function _nodeIcon(node) {
    const map = {
      entrance: 'E',
      exit: 'X',
      battle: 'B',
      event_battle: 'B',
      trap: 'T',
      rest: 'R',
      shop: 'S',
      boss: '!'
    };
    return map[node.kind] || '.';
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) {
    return _esc(value);
  }

  return Object.freeze({
    render,
    renderSelectedNode,
    renderNodeDetail
  });
})();
