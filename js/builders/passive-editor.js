// passive-editor.js
// UI: build passives by composing effects from the master library.
// Reads: data-store.js, effect-registry.js, ui-helpers.js, constants.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.PassiveEditor = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const ER = () => window.CJS.EffectRegistry;
  const UI = () => window.CJS.UI;
  const CM = () => window.CJS.ContentManager;

  let _container = null, _listEl = null, _formEl = null, _activeId = null;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="pas-search" placeholder="Search passives..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="pas-new">+ New</button>
          </div>
          <div class="data-list" id="pas-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="pas-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">
            Select a passive or create a new one
          </div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#pas-list');
    _formEl = _container.querySelector('#pas-form-area');
    _container.querySelector('#pas-new').onclick = () => _createNew();
    _container.querySelector('#pas-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function _renderList(query) {
    let items = CM()?.getVisibleItems?.('passives', query) || (query ? DS().search('passives', query) : DS().getAllAsArray('passives'));
    UI().renderDataList({
      container: _listEl, items, activeId: _activeId,
      onSelect: (p) => _load(p.id)
    });
  }

  function _createNew() {
    const id = DS().create('passives', {
      name: 'New Passive', icon: '🛡️', description: '', tags: [], effects: []
    });
    _activeId = id;
    _renderList();
    _load(id);
    UI().toast('Passive created', 'success');
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#pas-search')?.value);
    const p = DS().get('passives', id);
    if (!p) return;
    _renderForm(p);
  }

  function _renderForm(p) {
    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${p.icon || '🛡️'} ${p.name || 'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="pas-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="pas-del">Delete</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label>
            <input type="text" id="pas-name" value="${_esc(p.name||'')}">
          </div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label>
            <input type="text" id="pas-icon" value="${_esc(p.icon||'🛡️')}" style="text-align:center;font-size:1.2em">
          </div>
        </div>
        <div class="form-group" id="pas-tags-area"><label class="form-label">Tags</label></div>
        <h3>Effects</h3>
        <div id="pas-effects-area"></div>
        <div class="form-group mt-md"><label class="form-label">Description (auto-generated if blank)</label>
          <textarea id="pas-desc" rows="2">${_esc(p.description||'')}</textarea>
        </div>
        <div class="card" style="background:var(--surface2);margin-top:8px" id="pas-preview"></div>
        <div style="margin-top:12px">
          <button class="btn btn-success" id="pas-save">💾 Save Passive</button>
        </div>
      </div>
    `;

    const tagWidget = UI().createTagInput({ tags: p.tags || [] });
    _formEl.querySelector('#pas-tags-area').appendChild(tagWidget);

    const effectBuilder = UI().createEffectListBuilder({
      effects: p.effects || [],
      onChange: (effs) => _updatePreview(effs)
    });
    _formEl.querySelector('#pas-effects-area').appendChild(effectBuilder);

    _updatePreview(p.effects || []);

    _formEl.querySelector('#pas-save').onclick = () => {
      DS().replace('passives', p.id, {
        id: p.id,
        name: _formEl.querySelector('#pas-name').value,
        icon: _formEl.querySelector('#pas-icon').value,
        tags: tagWidget._getTags(),
        effects: effectBuilder._getEffects(),
        description: _formEl.querySelector('#pas-desc').value || _autoDesc(effectBuilder._getEffects())
      });
      _renderList();
      _load(p.id);
      UI().toast(`"${_formEl.querySelector('#pas-name').value}" saved`, 'success');
    };

    _formEl.querySelector('#pas-dup').onclick = () => {
      const newId = DS().duplicate('passives', p.id);
      if (newId) { _activeId = newId; _renderList(); _load(newId); UI().toast('Duplicated', 'success'); }
    };
    _formEl.querySelector('#pas-del').onclick = () => {
      UI().confirm(`Delete "${p.name}"?`, () => {
        DS().remove('passives', p.id);
        _activeId = null; _renderList();
        _formEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a passive or create a new one</div>';
        UI().toast('Deleted', 'info');
      });
    };
  }

  function _updatePreview(effects) {
    const el = _formEl.querySelector('#pas-preview');
    if (!el) return;
    const resolved = ER().resolveRefs(effects);
    const descs = resolved.map(e => ER().autoDescribe(e));
    el.innerHTML = `<div class="dim" style="font-size:0.82rem"><b>Preview:</b> ${descs.join(', ') || 'No effects'}</div>`;
  }

  function _autoDesc(effects) {
    return ER().resolveRefs(effects).map(e => ER().autoDescribe(e)).join(', ');
  }

  function _esc(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function refresh() { if (_container) _renderList(); }

  return Object.freeze({ init, refresh });
})();
