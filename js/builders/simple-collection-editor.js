// simple-collection-editor.js
// Generic list+detail editor for collections that don't need a bespoke builder
// (food, materials, crafting). Focus is on visibility: show what already exists
// per category, with clear scope/world chips, plus light editing.

window.CJS = window.CJS || {};

window.CJS.SimpleCollectionEditor = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const UI = () => window.CJS.UI;
  const CM = () => window.CJS.ContentManager;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function _scopeLabel(item) {
    const scope = item._scope || 'legacy';
    if (scope === 'world') {
      const world = DS().get('worlds', item._world);
      return world?.displayName || item._world || 'World';
    }
    if (scope === 'universal') return 'Universal';
    if (scope === 'system') return 'System';
    return 'Legacy';
  }

  function _renderInputsOutputs(label, group) {
    if (!group || typeof group !== 'object') return '';
    const sections = Object.entries(group).map(([bucket, entries]) => {
      const rows = Object.entries(entries || {}).map(([id, qty]) => {
        const item = DS().get('items', id) || DS().get('materials', id) || DS().get('food', id);
        const name = item?.name || id;
        const icon = item?.icon || '';
        return `<li>${_esc(icon)} ${_esc(name)} <span style="color:var(--text-mute)">×${_esc(qty)}</span> <span style="color:var(--text-mute);font-size:0.72rem">[${_esc(id)}]</span></li>`;
      }).join('');
      return `<div style="margin-bottom:6px"><div style="font-size:0.74rem;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.5px">${_esc(bucket)}</div><ul style="margin:4px 0;padding-left:18px">${rows}</ul></div>`;
    }).join('');
    if (!sections) return '';
    return `<div class="form-group"><label class="form-label">${_esc(label)}</label>${sections}</div>`;
  }

  function _bindInputForRecord(area, record, type, fields) {
    for (const field of fields) {
      const input = area.querySelector(`#sce-${field.key}`);
      if (!input) continue;
      input.addEventListener('change', () => {
        const next = { ...record, [field.key]: field.cast ? field.cast(input.value) : input.value };
        DS().replace(type, record.id, CM()?.prepareRecord ? CM().prepareRecord(type, record.id, next) : next);
        UI().toast(`${field.label} updated`, 'success', 1500);
      });
    }
  }

  function create({ type, singularLabel, pluralLabel, defaultIcon, defaults }) {
    let _container, _listEl, _formEl, _activeId = null;

    function init(containerEl) {
      _container = containerEl;
      _container.innerHTML = `
        <div class="flex gap-md" style="height:100%">
          <div style="width:280px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
            <div class="flex gap-sm items-center">
              <input type="search" id="sce-search" placeholder="Search ${_esc(pluralLabel)}..." style="flex:1">
              <button class="btn btn-primary btn-sm" id="sce-new">+ New</button>
            </div>
            <div class="data-list" id="sce-list" style="flex:1;max-height:none"></div>
          </div>
          <div style="flex:1;overflow-y:auto" id="sce-form-area">
            <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">
              Select a ${_esc(singularLabel)} or create a new one
            </div>
          </div>
        </div>
      `;
      _listEl = _container.querySelector('#sce-list');
      _formEl = _container.querySelector('#sce-form-area');
      _container.querySelector('#sce-new').onclick = _createNew;
      _container.querySelector('#sce-search').oninput = (e) => _renderList(e.target.value);
      _renderList();
    }

    function refresh() {
      if (!_container) return;
      _renderList(_container.querySelector('#sce-search')?.value);
      if (_activeId) _load(_activeId);
    }

    function _renderList(q) {
      const items = CM()?.getVisibleItems?.(type, q)
        || (q ? DS().search(type, q) : DS().getAllAsArray(type));
      UI().renderDataList({
        container: _listEl,
        items,
        activeId: _activeId,
        onSelect: (i) => _load(i.id),
        renderItem: (i) => {
          const meta = _metaSnippet(i);
          return `
            <span class="item-icon">${_esc(i.icon || defaultIcon)}</span>
            <div style="min-width:0">
              <div class="item-name">${_esc(i.name || i.id)}</div>
              <div class="item-sub">${meta}</div>
            </div>
          `;
        }
      });
    }

    function _metaSnippet(item) {
      const bits = [];
      if (item.rarity) bits.push(_esc(item.rarity));
      if (type === 'food' && item.buff?.stat) {
        bits.push(`${_esc(item.buff.stat)} +${_esc(item.buff.amount || 0)}`);
      }
      if (type === 'crafting' && item.station) {
        bits.push(`@${_esc(item.station)}`);
      }
      if (type === 'materials' && item.subCategory) {
        bits.push(_esc(item.subCategory));
      }
      return bits.join(' · ') || _esc(item.id);
    }

    function _createNew() {
      const baseDefaults = typeof defaults === 'function' ? defaults() : (defaults || {});
      const id = CM()?.createEntry
        ? null
        : DS().create(type, baseDefaults);
      if (id) {
        _activeId = id;
        _renderList();
        _load(id);
        UI().toast(`${singularLabel} created`, 'success');
        return;
      }
      CM().createEntry(type, baseDefaults, (newId) => {
        _activeId = newId;
        _renderList();
        _load(newId);
        UI().toast(`${singularLabel} created`, 'success');
      });
    }

    function _load(id) {
      _activeId = id;
      _renderList(_container.querySelector('#sce-search')?.value);
      const record = DS().get(type, id);
      if (!record) return;
      _renderForm(record);
    }

    function _renderForm(record) {
      const scopeLabel = _scopeLabel(record);
      const origin = record._origin ? `<div style="font-size:0.72rem;color:var(--text-mute)">${_esc(record._origin)}</div>` : '';
      _formEl.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${_esc(record.icon || defaultIcon)} ${_esc(record.name || 'Unnamed')}</span>
            <div class="btn-group">
              <span class="scope-chip" style="padding:2px 10px;border-radius:999px;border:1px solid var(--accent);color:var(--accent);font-size:0.72rem;font-weight:600">${_esc(scopeLabel)}</span>
              <button class="btn btn-ghost btn-sm" id="sce-dup">Duplicate</button>
              <button class="btn btn-danger btn-sm" id="sce-del">Delete</button>
            </div>
          </div>
          ${origin}
          <div class="form-row">
            <div class="form-group"><label class="form-label">ID</label><input type="text" value="${_esc(record.id)}" disabled></div>
            <div class="form-group"><label class="form-label">Name</label><input type="text" id="sce-name" value="${_esc(record.name || '')}"></div>
            <div class="form-group" style="flex:0 0 90px"><label class="form-label">Icon</label><input type="text" id="sce-icon" value="${_esc(record.icon || defaultIcon)}" style="text-align:center;font-size:1.2em"></div>
          </div>
          ${_renderTypeSpecific(record)}
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="sce-description" rows="3" style="width:100%">${_esc(record.description || '')}</textarea>
          </div>
        </div>
      `;

      _formEl.querySelector('#sce-dup').onclick = () => {
        const newId = DS().duplicate(type, record.id);
        if (newId) { _activeId = newId; _renderList(); _load(newId); UI().toast('Duplicated', 'success'); }
      };
      _formEl.querySelector('#sce-del').onclick = () => {
        UI().confirm(`Delete "${record.name || record.id}"?`, () => {
          DS().remove(type, record.id);
          _activeId = null;
          _renderList();
          _formEl.innerHTML = `<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a ${_esc(singularLabel)}</div>`;
          UI().toast('Deleted', 'info');
        });
      };

      _bindInputForRecord(_formEl, record, type, [
        { key: 'name', label: 'Name' },
        { key: 'icon', label: 'Icon' },
        { key: 'description', label: 'Description' }
      ]);

      _bindTypeSpecific(record);
    }

    function _renderTypeSpecific(record) {
      if (type === 'food') {
        const buff = record.buff || {};
        return `
          <div class="form-row">
            <div class="form-group" style="flex:0 0 140px"><label class="form-label">Rarity</label><input type="text" id="sce-rarity" value="${_esc(record.rarity || 'Common')}"></div>
            <div class="form-group" style="flex:0 0 160px"><label class="form-label">Duration</label><input type="text" id="sce-duration" value="${_esc(record.duration || 'next_battle')}"></div>
            <div class="form-group" style="flex:0 0 100px"><label class="form-label">Buff Stat</label><input type="text" id="sce-buff-stat" value="${_esc(buff.stat || '')}"></div>
            <div class="form-group" style="flex:0 0 100px"><label class="form-label">Buff Amount</label><input type="number" id="sce-buff-amount" value="${_esc(buff.amount || 0)}"></div>
          </div>
          ${_renderInputsOutputs('Inputs (read-only)', record.inputs)}
        `;
      }
      if (type === 'materials') {
        return `
          <div class="form-row">
            <div class="form-group" style="flex:0 0 140px"><label class="form-label">Rarity</label><input type="text" id="sce-rarity" value="${_esc(record.rarity || 'Common')}"></div>
            <div class="form-group" style="flex:0 0 200px"><label class="form-label">Sub-category</label><input type="text" id="sce-subCategory" value="${_esc(record.subCategory || 'material')}"></div>
            <div class="form-group" style="flex:0 0 120px"><label class="form-label">Value (gold)</label><input type="number" id="sce-value" value="${_esc(record.value || 0)}"></div>
          </div>
        `;
      }
      if (type === 'crafting') {
        return `
          <div class="form-row">
            <div class="form-group" style="flex:0 0 200px"><label class="form-label">Station</label><input type="text" id="sce-station" value="${_esc(record.station || 'workbench')}"></div>
          </div>
          ${_renderInputsOutputs('Inputs (read-only)', record.inputs)}
          ${_renderInputsOutputs('Outputs (read-only)', record.outputs)}
        `;
      }
      return '';
    }

    function _bindTypeSpecific(record) {
      const fields = [];
      if (type === 'food') {
        fields.push({ key: 'rarity', label: 'Rarity' });
        fields.push({ key: 'duration', label: 'Duration' });
        // Buff is a nested object — handle separately
        const stat = _formEl.querySelector('#sce-buff-stat');
        const amount = _formEl.querySelector('#sce-buff-amount');
        const updateBuff = () => {
          const next = { ...record, buff: { stat: stat.value, amount: Number(amount.value) || 0 } };
          DS().replace(type, record.id, CM()?.prepareRecord ? CM().prepareRecord(type, record.id, next) : next);
          UI().toast('Buff updated', 'success', 1500);
        };
        stat?.addEventListener('change', updateBuff);
        amount?.addEventListener('change', updateBuff);
      }
      if (type === 'materials') {
        fields.push({ key: 'rarity', label: 'Rarity' });
        fields.push({ key: 'subCategory', label: 'Sub-category' });
        fields.push({ key: 'value', label: 'Value', cast: (v) => Number(v) || 0 });
      }
      if (type === 'crafting') {
        fields.push({ key: 'station', label: 'Station' });
      }
      _bindInputForRecord(_formEl, record, type, fields);
    }

    return Object.freeze({ init, refresh });
  }

  return Object.freeze({
    food: create({
      type: 'food',
      singularLabel: 'food',
      pluralLabel: 'food',
      defaultIcon: '🍲',
      defaults: () => ({
        name: 'New Food', icon: '🍲', rarity: 'Common', duration: 'next_battle',
        buff: { stat: 'E', amount: 1 }, inputs: { materials: {} }, description: ''
      })
    }),
    materials: create({
      type: 'materials',
      singularLabel: 'material',
      pluralLabel: 'materials',
      defaultIcon: '🧱',
      defaults: () => ({
        name: 'New Material', icon: '🧱', rarity: 'Common',
        subCategory: 'material', value: 0, description: ''
      })
    }),
    crafting: create({
      type: 'crafting',
      singularLabel: 'recipe',
      pluralLabel: 'recipes',
      defaultIcon: '🔨',
      defaults: () => ({
        name: 'New Recipe', icon: '🔨', station: 'workbench',
        inputs: { materials: {} }, outputs: { items: {} }, description: ''
      })
    })
  });
})();
