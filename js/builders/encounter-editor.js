// encounter-editor.js
// UI: grid painter + unit placement for encounter design.
// Reads: data-store.js, constants.js, ui-helpers.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.EncounterEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const UI = () => window.CJS.UI;

  let _container, _listEl, _formEl, _activeId = null;

  // Current encounter state
  let _grid = [];     // 2D array of terrain type strings
  let _units = [];    // [{ id, pos: [row, col] }]
  let _width = 8, _height = 8;
  let _paintMode = 'terrain'; // 'terrain' | 'unit' | 'erase_unit'
  let _selectedTerrain = 'empty';
  let _selectedUnit = null;   // unit ID to place
  let _isMouseDown = false;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:240px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <button class="btn btn-primary btn-sm" id="enc-new" style="flex:1">+ New Encounter</button>
          </div>
          <div class="data-list" id="enc-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="enc-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select or create an encounter</div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#enc-list');
    _formEl = _container.querySelector('#enc-form-area');
    _container.querySelector('#enc-new').onclick = _createNew;
    _renderList();
  }

  function _renderList() {
    const items = DS().getAllAsArray('encounters');
    UI().renderDataList({
      container: _listEl, items, activeId: _activeId,
      onSelect: (e) => _load(e.id),
      renderItem: (e) => `<span class="item-icon">🗺️</span><div><div class="item-name">${e.name||e.id}</div><div class="item-sub">${e.width||8}×${e.height||8} · ${(e.units||[]).length} units</div></div>`
    });
  }

  function _createNew() {
    const id = DS().create('encounters', {
      name: 'New Encounter', width: 8, height: 8,
      grid: _makeEmptyGrid(8, 8), units: []
    });
    _activeId = id; _renderList(); _load(id);
    UI().toast('Encounter created', 'success');
  }

  function _makeEmptyGrid(w, h) {
    return Array.from({length: h}, () => Array.from({length: w}, () => 'empty'));
  }

  function _load(id) {
    _activeId = id;
    _renderList();
    const enc = DS().get('encounters', id);
    if (!enc) return;
    _width = enc.width || 8;
    _height = enc.height || 8;
    _grid = enc.grid || _makeEmptyGrid(_width, _height);
    _units = enc.units ? JSON.parse(JSON.stringify(enc.units)) : [];
    _renderForm(enc);
  }

  function _renderForm(enc) {
    const terrainTypes = C().TERRAIN_TYPES;
    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🗺️ ${enc.name || 'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="enc-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="enc-del">Delete</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label><input type="text" id="enc-name" value="${_esc(enc.name||'')}"></div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Width</label><input type="number" id="enc-w" value="${_width}" min="4" max="16"></div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Height</label><input type="number" id="enc-h" value="${_height}" min="4" max="16"></div>
          <div class="form-group" style="flex:0 0 auto;display:flex;align-items:flex-end"><button class="btn btn-ghost btn-sm" id="enc-resize">Resize</button></div>
        </div>

        <h3>Terrain Palette</h3>
        <div class="filter-bar" id="enc-terrain-palette"></div>

        <h3>Place Units</h3>
        <div class="flex gap-sm items-center mb-sm">
          <button class="btn btn-ghost btn-sm" id="enc-mode-terrain">🎨 Paint Terrain</button>
          <button class="btn btn-ghost btn-sm" id="enc-mode-unit">👤 Place Unit</button>
          <button class="btn btn-ghost btn-sm" id="enc-mode-erase">🗑️ Erase Unit</button>
        </div>
        <div id="enc-unit-select" style="display:none;margin-bottom:8px"></div>

        <h3>Grid <span class="dim" style="font-size:0.8em">(click/drag to paint)</span></h3>
        <div id="enc-grid-container" style="overflow:auto;padding-bottom:8px"></div>

        <h3>Placed Units <span class="dim" style="font-size:0.8em">(${_units.length})</span></h3>
        <div id="enc-unit-list" style="font-size:0.85rem"></div>

        <div style="margin-top:16px"><button class="btn btn-success" id="enc-save">💾 Save Encounter</button></div>
      </div>
    `;

    // ── Terrain palette ──
    const palette = _formEl.querySelector('#enc-terrain-palette');
    for (const [key, data] of Object.entries(terrainTypes)) {
      const btn = document.createElement('button');
      btn.className = `filter-btn${_selectedTerrain===key?' active':''}`;
      btn.dataset.terrain = key;
      btn.style.cssText = `border-left:3px solid ${data.color}`;
      btn.textContent = `${data.icon||''} ${key}`;
      btn.onclick = () => {
        palette.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        _selectedTerrain = key;
        _paintMode = 'terrain';
        _updateModeButtons();
      };
      palette.appendChild(btn);
    }

    // ── Mode buttons ──
    _formEl.querySelector('#enc-mode-terrain').onclick = () => { _paintMode = 'terrain'; _updateModeButtons(); };
    _formEl.querySelector('#enc-mode-unit').onclick = () => { _paintMode = 'unit'; _updateModeButtons(); _showUnitSelect(); };
    _formEl.querySelector('#enc-mode-erase').onclick = () => { _paintMode = 'erase_unit'; _updateModeButtons(); };

    // ── Resize ──
    _formEl.querySelector('#enc-resize').onclick = () => {
      const nw = Number(_formEl.querySelector('#enc-w').value) || 8;
      const nh = Number(_formEl.querySelector('#enc-h').value) || 8;
      _resizeGrid(nw, nh);
      _renderGrid();
      _renderUnitList();
    };

    // ── Render ──
    _renderGrid();
    _renderUnitList();
    _updateModeButtons();

    // ── Save/Dup/Del ──
    _formEl.querySelector('#enc-save').onclick = () => _save(enc.id);
    _formEl.querySelector('#enc-dup').onclick = () => { const nid=DS().duplicate('encounters',enc.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#enc-del').onclick = () => { UI().confirm(`Delete "${enc.name}"?`,()=>{DS().remove('encounters',enc.id);_activeId=null;_renderList();_formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select an encounter</div>';UI().toast('Deleted','info');}); };
  }

  function _updateModeButtons() {
    const btns = _formEl.querySelectorAll('#enc-mode-terrain,#enc-mode-unit,#enc-mode-erase');
    btns.forEach(b => b.classList.remove('btn-primary'));
    btns.forEach(b => b.classList.add('btn-ghost'));
    if (_paintMode === 'terrain') { btns[0].classList.remove('btn-ghost'); btns[0].classList.add('btn-primary'); }
    if (_paintMode === 'unit')    { btns[1].classList.remove('btn-ghost'); btns[1].classList.add('btn-primary'); }
    if (_paintMode === 'erase_unit') { btns[2].classList.remove('btn-ghost'); btns[2].classList.add('btn-primary'); }
    _formEl.querySelector('#enc-unit-select').style.display = _paintMode === 'unit' ? 'block' : 'none';
  }

  function _showUnitSelect() {
    const area = _formEl.querySelector('#enc-unit-select');
    const chars = DS().getAllAsArray('characters');
    const mons = DS().getAllAsArray('monsters');
    const all = [...chars, ...mons];
    area.innerHTML = `<select id="enc-unit-picker">
      <option value="">— Select unit to place —</option>
      <optgroup label="Characters">${chars.map(c=>`<option value="${c.id}">${c.icon||''} ${c.name||c.id}</option>`).join('')}</optgroup>
      <optgroup label="Monsters">${mons.map(m=>`<option value="${m.id}">${m.icon||''} ${m.name||m.id}</option>`).join('')}</optgroup>
    </select>`;
    area.querySelector('#enc-unit-picker').onchange = (e) => { _selectedUnit = e.target.value || null; };
  }

  function _renderGrid() {
    const container = _formEl.querySelector('#enc-grid-container');
    container.innerHTML = '';
    const terrainTypes = C().TERRAIN_TYPES;

    const gridEl = document.createElement('div');
    gridEl.className = 'grid-container';

    // Prevent text selection during drag
    gridEl.style.userSelect = 'none';

    for (let r = 0; r < _height; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      for (let c = 0; c < _width; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        const terrain = _grid[r]?.[c] || 'empty';
        const td = terrainTypes[terrain] || terrainTypes.empty;
        cell.style.background = td.color;
        cell.title = `[${r},${c}] ${terrain}`;

        // Show terrain icon
        if (td.icon) cell.textContent = td.icon;

        // Show unit on cell
        const unitHere = _units.find(u => u.pos && u.pos[0] === r && u.pos[1] === c);
        if (unitHere) {
          const unitData = DS().get('characters', unitHere.id) || DS().get('monsters', unitHere.id);
          const unitSpan = document.createElement('span');
          unitSpan.className = 'cell-unit';
          unitSpan.textContent = unitData?.icon || '⬤';
          unitSpan.title = unitData?.name || unitHere.id;
          cell.appendChild(unitSpan);
          cell.style.outline = '2px solid var(--gold)';
          cell.style.outlineOffset = '-2px';
        }

        cell.onmousedown = (e) => { e.preventDefault(); _isMouseDown = true; _cellAction(r, c); };
        cell.onmouseenter = () => { if (_isMouseDown) _cellAction(r, c); };

        rowEl.appendChild(cell);
      }
      gridEl.appendChild(rowEl);
    }

    document.addEventListener('mouseup', () => { _isMouseDown = false; }, { once: false });

    container.appendChild(gridEl);
  }

  function _cellAction(r, c) {
    if (_paintMode === 'terrain') {
      if (_grid[r]) _grid[r][c] = _selectedTerrain;
      _renderGrid();
    } else if (_paintMode === 'unit' && _selectedUnit) {
      // Remove existing unit at same position
      _units = _units.filter(u => !(u.pos[0] === r && u.pos[1] === c));
      _units.push({ id: _selectedUnit, pos: [r, c] });
      _renderGrid();
      _renderUnitList();
    } else if (_paintMode === 'erase_unit') {
      _units = _units.filter(u => !(u.pos[0] === r && u.pos[1] === c));
      _renderGrid();
      _renderUnitList();
    }
  }

  function _renderUnitList() {
    const el = _formEl.querySelector('#enc-unit-list');
    if (!el) return;
    if (_units.length === 0) { el.innerHTML = '<div class="dim">No units placed yet</div>'; return; }
    el.innerHTML = _units.map((u, i) => {
      const data = DS().get('characters', u.id) || DS().get('monsters', u.id);
      return `<div class="effect-chip">
        <span class="chip-icon">${data?.icon||'⬤'}</span>
        <span class="chip-name">${data?.name||u.id}</span>
        <span class="chip-desc">pos [${u.pos[0]},${u.pos[1]}]</span>
        <button class="btn-icon" onclick="CJS.EncounterEditor._removeUnit(${i})">❌</button>
      </div>`;
    }).join('');
    // Update the heading count
    const h3 = _formEl.querySelector('h3:last-of-type');
    // Not ideal but functional
  }

  function _removeUnit(index) {
    _units.splice(index, 1);
    _renderGrid();
    _renderUnitList();
  }

  function _resizeGrid(newW, newH) {
    const oldGrid = _grid;
    _grid = [];
    for (let r = 0; r < newH; r++) {
      _grid[r] = [];
      for (let c = 0; c < newW; c++) {
        _grid[r][c] = (oldGrid[r] && oldGrid[r][c]) ? oldGrid[r][c] : 'empty';
      }
    }
    _width = newW;
    _height = newH;
    // Remove units outside new bounds
    _units = _units.filter(u => u.pos[0] < newH && u.pos[1] < newW);
  }

  function _save(id) {
    DS().replace('encounters', id, {
      id,
      name: _formEl.querySelector('#enc-name').value,
      width: _width,
      height: _height,
      grid: _grid,
      units: _units
    });
    _renderList();
    UI().toast('Encounter saved', 'success');
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }

  return Object.freeze({ init, refresh, _removeUnit });
})();
