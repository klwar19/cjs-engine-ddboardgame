// campaign-editor.js
// Generic campaign/side-content JSON editor for authored campaign files.

window.CJS = window.CJS || {};

window.CJS.CampaignEditor = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CM = () => window.CJS.ContentManager;
  const UI = () => window.CJS.UI;

  const TYPES = [
    ['campaigns', 'Campaigns'],
    ['scenarios', 'Scenarios'],
    ['scenarioMaps', 'Scenario Maps'],
    ['campaignEvents', 'Event Tables'],
    ['campaignQuests', 'Quest Templates'],
    ['campaignHubs', 'Living Hubs'],
    ['sideContentPacks', 'Side Packs'],
    ['questChains', 'Quest Chains'],
    ['battleSets', 'Battle Sets'],
    ['mapSeeds', 'Map Seeds'],
    ['oracleTables', 'Oracles'],
    ['campaignProfiles', 'Carryover'],
    ['pocketHavenRules', 'Pocket Haven']
  ];

  let _container = null;
  let _activeType = 'campaigns';
  let _activeId = null;
  let _query = '';

  function init(el) {
    _container = el;
    render();
  }

  function refresh() {
    if (_container) render();
  }

  function render() {
    if (!_container) return;
    _container.innerHTML = `
      <div style="display:grid;grid-template-columns:280px minmax(0,1fr);gap:12px;height:100%">
        <aside style="border-right:1px solid var(--border);padding-right:12px;overflow:auto">
          <div class="hint-box hint-info">Campaign data is authored as plain JSON. Side Forge cards, hubs, quest chains, battle sets, map seeds, and oracle tables live in separate files for easy future edits.</div>
          <div class="btn-group" style="flex-wrap:wrap;margin-bottom:10px">
            ${TYPES.map(([type, label]) => `<button class="btn btn-sm ${type === _activeType ? 'btn-primary' : ''}" data-campaign-type="${type}">${label}</button>`).join('')}
          </div>
          <input id="campaign-editor-search" type="search" placeholder="Filter ${_activeType}..." value="${_escAttr(_query)}" style="width:100%;margin-bottom:10px">
          <div class="btn-group" style="margin-bottom:10px">
            <button class="btn btn-sm btn-primary" data-campaign-action="new">New</button>
            <button class="btn btn-sm" data-campaign-action="duplicate" ${_activeId ? '' : 'disabled'}>Duplicate</button>
            <button class="btn btn-sm btn-danger" data-campaign-action="delete" ${_activeId ? '' : 'disabled'}>Delete</button>
          </div>
          <div id="campaign-editor-list"></div>
        </aside>
        <main style="display:flex;flex-direction:column;min-width:0">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
            <h3 style="margin:0;color:var(--accent)">${_esc(_labelFor(_activeType))}</h3>
            <span id="campaign-editor-active" style="color:var(--text-mute);font-size:0.82rem">${_esc(_activeId || 'No record selected')}</span>
            <div style="margin-left:auto" class="btn-group">
              <a class="btn btn-sm btn-ghost" href="campaign.html" style="text-decoration:none">Open Campaign</a>
              <button class="btn btn-sm btn-primary" data-campaign-action="save" ${_activeId ? '' : 'disabled'}>Save JSON</button>
            </div>
          </div>
          <textarea id="campaign-editor-json" spellcheck="false" ${_activeId ? '' : 'disabled'} style="flex:1;min-height:420px;font-family:Consolas,monospace;font-size:0.84rem;line-height:1.45"></textarea>
        </main>
      </div>
    `;

    _bind();
    _renderList();
    _renderEditor();
  }

  function _bind() {
    _container.querySelectorAll('[data-campaign-type]').forEach((button) => {
      button.onclick = () => {
        _activeType = button.dataset.campaignType;
        _activeId = null;
        _query = '';
        render();
      };
    });

    _container.querySelector('#campaign-editor-search').oninput = (event) => {
      _query = event.target.value;
      _renderList();
    };

    _container.querySelectorAll('[data-campaign-action]').forEach((button) => {
      button.onclick = () => _handleAction(button.dataset.campaignAction);
    });
  }

  function _renderList() {
    const list = _container.querySelector('#campaign-editor-list');
    const items = CM().getVisibleItems?.(_activeType, _query) || DS().getAllAsArray(_activeType);
    list.innerHTML = items.map((item) => `
      <div class="data-list-item ${item.id === _activeId ? 'active' : ''}" data-id="${_escAttr(item.id)}" style="align-items:flex-start">
        <div style="min-width:0">
          <div class="item-name">${_esc(item.name || item.title || item.id)}</div>
          <div class="item-sub">${_esc(item.id || '')}</div>
        </div>
        ${CM().renderScopeChip?.(item) || ''}
      </div>
    `).join('') || '<div class="data-list-empty">No records.</div>';

    list.querySelectorAll('[data-id]').forEach((row) => {
      row.onclick = () => {
        _activeId = row.dataset.id;
        _renderList();
        _renderEditor();
      };
    });
  }

  function _renderEditor() {
    const textarea = _container.querySelector('#campaign-editor-json');
    const active = _container.querySelector('#campaign-editor-active');
    const record = _activeId ? DS().get(_activeType, _activeId) : null;
    active.textContent = _activeId || 'No record selected';
    textarea.disabled = !record;
    textarea.value = record ? JSON.stringify(_stripMeta(record), null, 2) : '';
  }

  function _handleAction(action) {
    if (action === 'new') return _newRecord();
    if (action === 'duplicate') return _duplicateRecord();
    if (action === 'delete') return _deleteRecord();
    if (action === 'save') return _saveRecord();
  }

  function _newRecord() {
    const defaults = _templateFor(_activeType);
    CM().createEntry(_activeType, defaults, (id) => {
      _activeId = id;
      UI().toast(`Created ${id}`, 'success');
      render();
    });
  }

  function _duplicateRecord() {
    if (!_activeId) return;
    const id = DS().duplicate(_activeType, _activeId);
    if (id) {
      _activeId = id;
      UI().toast(`Duplicated ${id}`, 'success');
      render();
    }
  }

  function _deleteRecord() {
    if (!_activeId || !window.confirm(`Delete ${_activeId}?`)) return;
    DS().remove(_activeType, _activeId);
    _activeId = null;
    render();
  }

  function _saveRecord() {
    const textarea = _container.querySelector('#campaign-editor-json');
    try {
      const parsed = JSON.parse(textarea.value || '{}');
      if (!parsed.id) throw new Error('Record must include id.');
      if (parsed.id !== _activeId) throw new Error('ID changes are not allowed here. Duplicate first if you need a new ID.');
      const prepared = CM().prepareRecord(_activeType, _activeId, parsed);
      DS().replace(_activeType, _activeId, prepared);
      UI().toast(`Saved ${_activeId}`, 'success');
      render();
    } catch (error) {
      UI().toast(error.message || 'Invalid JSON', 'error', 5000);
    }
  }

  function _templateFor(type) {
    const world = CM().getFilters?.().world !== 'all' ? CM().getFilters().world : 'haven';
    switch (type) {
      case 'campaigns':
        return { id: '', name: 'New Campaign', version: 1, world, startChapter: 1, startPhase: 'town_phase', scenarios: [], maps: [], eventTables: [], questTemplates: [], hubs: [], sideContentPacks: [], startingState: { currencies: {}, items: {}, materials: {}, food: {}, questItems: {}, party: [] } };
      case 'scenarios':
        return { id: '', name: 'New Scenario', world, mapId: '', startNode: '', randomBattleTable: [], setBattles: [], notes: '' };
      case 'scenarioMaps':
        return { id: '', name: 'New Map', world, nodes: [], links: [], notes: '' };
      case 'campaignEvents':
        return { id: '', name: 'New Event Table', world, events: [] };
      case 'campaignQuests':
        return { id: '', name: 'New Quest Templates', world, templates: [] };
      case 'campaignHubs':
        return { id: '', name: 'New Hub', world, zone: '', defaultMood: 'neutral', locations: [], npcs: [], hubStats: {}, startingProblems: [], eventTables: {} };
      case 'sideContentPacks':
        return { id: '', name: 'New Side Content Pack', version: 1, world, zone: '', hubId: '', canonPolicy: { gmControlsMainStory: true, defaultCanonRisk: 'green', redRequiresReview: true }, contentRefs: {}, hubEvents: [], tags: [] };
      case 'questChains':
        return { id: '', name: 'New Quest Chain Set', world, zone: '', hubId: '', chains: [] };
      case 'battleSets':
        return { id: '', name: 'New Battle Set', world, zone: '', hubId: '', cards: [] };
      case 'mapSeeds':
        return { id: '', name: 'New Map Seeds', world, zone: '', hubId: '', seeds: [] };
      case 'oracleTables':
        return { id: '', name: 'New Oracle Table', world, zone: '', hubId: '', defaultCanonRisk: 'green', tables: {}, prompts: [] };
      case 'campaignProfiles':
        return { id: '', name: 'New Carryover Profile', rules: [] };
      case 'pocketHavenRules':
        return { id: '', name: 'New Pocket Haven Rules', farm: {}, stations: [] };
      default:
        return { id: '', name: 'New Record' };
    }
  }

  function _stripMeta(value) {
    if (Array.isArray(value)) return value.map(_stripMeta);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('_')).map(([key, val]) => [key, _stripMeta(val)]));
  }

  function _labelFor(type) {
    return TYPES.find(([id]) => id === type)?.[1] || type;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) {
    return _esc(value);
  }

  return Object.freeze({ init, refresh });
})();
