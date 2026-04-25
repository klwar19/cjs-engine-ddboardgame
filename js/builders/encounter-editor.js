// encounter-editor.js
// UI: grid painter + unit placement for encounter design.
// Supports multi-cell units (1x1, 2x1, 1x2, 2x2, 3x3).
// Enforces: no overlap, no placement on obstacles, no move-through.
// Reads: data-store.js, constants.js, ui-helpers.js, formulas.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.EncounterEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const UI = () => window.CJS.UI;
  const CM = () => window.CJS.ContentManager;

  let _container, _listEl, _formEl, _activeId = null;

  // Current encounter state
  let _grid = [];     // 2D array of terrain type strings
  let _units = [];    // [{ id, pos: [row, col], size: "1x1" }]
  let _width = 8, _height = 8;
  let _paintMode = 'terrain'; // 'terrain' | 'unit' | 'erase_unit'
  let _selectedTerrain = 'empty';
  let _selectedUnit = null;   // unit ID to place
  let _selectedUnitSize = '1x1';
  let _isMouseDown = false;

  // ── Find which unit occupies a cell ──
  function _unitAtCell(r, c) {
    for (const u of _units) {
      const sz = C().UNIT_SIZES[u.size || '1x1'] || { w: 1, h: 1 };
      if (r >= u.pos[0] && r < u.pos[0] + sz.h &&
          c >= u.pos[1] && c < u.pos[1] + sz.w) {
        return u;
      }
    }
    return null;
  }

  // ── Check if a multi-cell unit fits at [r,c] ──
  function _canPlace(size, r, c, ignoreIdx) {
    const sz = C().UNIT_SIZES[size || '1x1'] || { w: 1, h: 1 };
    for (let dr = 0; dr < sz.h; dr++) {
      for (let dc = 0; dc < sz.w; dc++) {
        const tr = r + dr, tc = c + dc;
        if (tr < 0 || tr >= _height || tc < 0 || tc >= _width) return false;
        const terrain = _grid[tr]?.[tc] || 'empty';
        const td = C().TERRAIN_TYPES[terrain];
        if (td && !td.passable) return false;
        const existing = _unitAtCell(tr, tc);
        if (existing && _units.indexOf(existing) !== ignoreIdx) return false;
      }
    }
    return true;
  }

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:240px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary btn-sm" id="enc-new" style="width:100%">+ New Encounter</button>
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
    const items = CM()?.getVisibleItems?.('encounters') || DS().getAllAsArray('encounters');
    UI().renderDataList({
      container: _listEl, items, activeId: _activeId,
      onSelect: (e) => _load(e.id),
      renderItem: (e) => `<span class="item-icon">🗺️</span><div><div class="item-name">${e.name||e.id}</div><div class="item-sub">${e.width||8}×${e.height||8} · ${(e.units||[]).length} units</div></div>`
    });
  }

  function _createNew() {
    const id = DS().create('encounters', {
      name: 'New Encounter', width: 8, height: 8,
      grid: _emptyGrid(8, 8), units: []
    });
    _activeId = id; _renderList(); _load(id);
    UI().toast('Encounter created', 'success');
  }

  function _emptyGrid(w, h) {
    return Array.from({length: h}, () => Array(w).fill('empty'));
  }

  function _load(id) {
    _activeId = id; _renderList();
    const enc = DS().get('encounters', id);
    if (!enc) return;
    _width = enc.width || 8;
    _height = enc.height || 8;
    _grid = enc.grid || _emptyGrid(_width, _height);
    _units = enc.units ? JSON.parse(JSON.stringify(enc.units)) : [];
    // Backfill size from unit data
    for (const u of _units) {
      if (!u.size) {
        const d = DS().get('characters', u.id) || DS().get('monsters', u.id);
        u.size = d?.size || '1x1';
      }
    }
    _renderForm(enc);
  }

  function _renderForm(enc) {
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

        <h3>Terrain <span class="dim" style="font-size:0.78em">— cost shown as ×N, 👁 = blocks LoS</span></h3>
        <div class="filter-bar" id="enc-terrain-palette" style="max-height:90px;overflow-y:auto"></div>

        <h3>Tools</h3>
        <div class="flex gap-sm items-center mb-sm flex-wrap">
          <button class="btn btn-primary btn-sm" id="enc-mode-terrain">🎨 Paint Terrain</button>
          <button class="btn btn-ghost btn-sm" id="enc-mode-unit">👤 Place Unit</button>
          <button class="btn btn-ghost btn-sm" id="enc-mode-erase">🗑️ Erase Unit</button>
        </div>
        <div id="enc-unit-select" style="display:none;margin-bottom:8px"></div>

        <h3>Grid <span class="dim" style="font-size:0.78em">${_width}×${_height}</span></h3>
        <div id="enc-grid-container" style="overflow:auto;padding-bottom:8px"></div>

        <h3>Placed Units (${_units.length})</h3>
        <div id="enc-unit-list" style="font-size:0.85rem"></div>

        <div class="card" style="background:var(--surface2);margin-top:8px">
          <div class="dim" style="font-size:0.78rem">
            <b>Movement:</b> Flat per-unit value. Cannot move through units or impassable terrain.
            Terrain costs: ice/water/high ground ×2, mud/rubble ×3.<br>
            <b>LoS:</b> Obstacles, walls, pillars, trees block ranged line of sight. 2×2+ units also block LoS.<br>
            <b>Knockback:</b> Hitting wall = ${C().COLLISION.wallDamageFlat} collision dmg. Hitting unit = ${C().COLLISION.unitCollisionDamageFlat} dmg to both. Larger pushes smaller.
            END/${C().COLLISION.knockbackResistPerEnd} reduces knockback by 1.
          </div>
        </div>

        <div style="margin-top:16px"><button class="btn btn-success" id="enc-save">💾 Save Encounter</button></div>
      </div>
    `;

    // ── Terrain palette ──
    const palette = _formEl.querySelector('#enc-terrain-palette');
    for (const [key, data] of Object.entries(C().TERRAIN_TYPES)) {
      const btn = document.createElement('button');
      btn.className = `filter-btn${_selectedTerrain===key?' active':''}`;
      btn.style.borderLeft = `3px solid ${data.color}`;
      const cost = data.moveCost >= 999 ? '✘' : data.moveCost > 1 ? `×${data.moveCost}` : '';
      const los = data.blocksLoS ? '👁' : '';
      btn.textContent = `${data.icon||''} ${key} ${cost}${los}`.trim();
      btn.title = `Move cost: ${data.moveCost}${data.blocksLoS ? ', blocks LoS' : ''}`;
      btn.onclick = () => {
        palette.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        _selectedTerrain = key;
        _paintMode = 'terrain';
        _updateModeButtons();
      };
      palette.appendChild(btn);
    }

    // Mode buttons
    _formEl.querySelector('#enc-mode-terrain').onclick = () => { _paintMode = 'terrain'; _updateModeButtons(); };
    _formEl.querySelector('#enc-mode-unit').onclick = () => { _paintMode = 'unit'; _updateModeButtons(); _showUnitSelect(); };
    _formEl.querySelector('#enc-mode-erase').onclick = () => { _paintMode = 'erase_unit'; _updateModeButtons(); };
    _formEl.querySelector('#enc-resize').onclick = () => {
      const nw = Math.min(16, Math.max(4, Number(_formEl.querySelector('#enc-w').value) || 8));
      const nh = Math.min(16, Math.max(4, Number(_formEl.querySelector('#enc-h').value) || 8));
      _resizeGrid(nw, nh);
      _renderGrid(); _renderUnitList();
    };

    document.removeEventListener('mouseup', _onMouseUp);
    document.addEventListener('mouseup', _onMouseUp);

    _renderGrid(); _renderUnitList(); _updateModeButtons();

    _formEl.querySelector('#enc-save').onclick = () => _save(enc.id);
    _formEl.querySelector('#enc-dup').onclick = () => { const nid=DS().duplicate('encounters',enc.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#enc-del').onclick = () => { UI().confirm(`Delete "${enc.name}"?`,()=>{DS().remove('encounters',enc.id);_activeId=null;_renderList();_formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select an encounter</div>';UI().toast('Deleted','info');}); };
  }

  function _onMouseUp() { _isMouseDown = false; }

  function _updateModeButtons() {
    const btns = _formEl.querySelectorAll('#enc-mode-terrain,#enc-mode-unit,#enc-mode-erase');
    btns.forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
    const idx = { terrain: 0, unit: 1, erase_unit: 2 }[_paintMode] ?? 0;
    btns[idx].classList.remove('btn-ghost'); btns[idx].classList.add('btn-primary');
    const us = _formEl.querySelector('#enc-unit-select');
    if (us) us.style.display = _paintMode === 'unit' ? 'block' : 'none';
  }

  function _showUnitSelect() {
    const area = _formEl.querySelector('#enc-unit-select');
    const chars = DS().getAllAsArray('characters');
    const mons = DS().getAllAsArray('monsters');
    area.innerHTML = `<select id="enc-unit-picker">
      <option value="">— Select unit —</option>
      <optgroup label="Characters">${chars.map(c => {
        const sz = c.size||'1x1', mv = c.movement||3;
        return `<option value="${c.id}" data-size="${sz}">${c.icon||''} ${c.name} [${C().UNIT_SIZES[sz]?.label||sz}, mv:${mv}]</option>`;
      }).join('')}</optgroup>
      <optgroup label="Monsters">${mons.map(m => {
        const sz = m.size||'1x1', mv = m.movement||3;
        return `<option value="${m.id}" data-size="${sz}">${m.icon||''} ${m.name} [${C().UNIT_SIZES[sz]?.label||sz}, mv:${mv}]</option>`;
      }).join('')}</optgroup>
    </select>`;
    area.querySelector('#enc-unit-picker').onchange = (e) => {
      _selectedUnit = e.target.value || null;
      _selectedUnitSize = e.target.selectedOptions[0]?.dataset?.size || '1x1';
    };
  }

  // ── GRID RENDERING ──────────────────────────────────────────────
  function _renderGrid() {
    const container = _formEl.querySelector('#enc-grid-container');
    if (!container) return;
    container.innerHTML = '';
    const tt = C().TERRAIN_TYPES;

    // Pre-compute unit coverage
    const anchorAt = {};  // "r,c" → unit (top-left only)
    const coverAt = {};   // "r,c" → unit (all cells)
    for (const u of _units) {
      const sz = C().UNIT_SIZES[u.size || '1x1'] || { w:1, h:1 };
      anchorAt[`${u.pos[0]},${u.pos[1]}`] = u;
      for (let dr = 0; dr < sz.h; dr++)
        for (let dc = 0; dc < sz.w; dc++)
          coverAt[`${u.pos[0]+dr},${u.pos[1]+dc}`] = u;
    }

    const gridEl = document.createElement('div');
    gridEl.className = 'grid-container';
    gridEl.style.userSelect = 'none';

    for (let r = 0; r < _height; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      for (let c = 0; c < _width; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        const terrain = _grid[r]?.[c] || 'empty';
        const td = tt[terrain] || tt.empty;
        cell.style.background = td.color;
        cell.style.position = 'relative';

        // Terrain cost badge
        if (td.moveCost > 1 && td.moveCost < 999) {
          const badge = document.createElement('span');
          badge.style.cssText = 'position:absolute;top:1px;right:2px;font-size:0.55em;color:var(--gold);opacity:0.8';
          badge.textContent = `×${td.moveCost}`;
          cell.appendChild(badge);
        }
        if (td.blocksLoS) {
          const losBadge = document.createElement('span');
          losBadge.style.cssText = 'position:absolute;bottom:1px;right:2px;font-size:0.5em;opacity:0.6';
          losBadge.textContent = '👁';
          cell.appendChild(losBadge);
        }

        const key = `${r},${c}`;
        const anchor = anchorAt[key];
        const cover = coverAt[key];

        if (anchor) {
          // Unit anchor — render icon spanning the full footprint
          const data = DS().get('characters', anchor.id) || DS().get('monsters', anchor.id);
          const sz = C().UNIT_SIZES[anchor.size||'1x1'] || {w:1,h:1};
          const isEnemy = data?.team === 'enemy';

          const icon = document.createElement('div');
          icon.style.cssText = `
            position:absolute; top:0; left:0; z-index:2;
            width:${sz.w*56}px; height:${sz.h*56}px;
            display:flex; align-items:center; justify-content:center;
            font-size:${Math.max(1.2, sz.w * 0.9)}em;
            pointer-events:none;
          `;
          icon.textContent = data?.icon || '⬤';
          cell.appendChild(icon);

          // Size border
          const border = document.createElement('div');
          border.style.cssText = `
            position:absolute; top:-1px; left:-1px; z-index:3;
            width:${sz.w*56+1}px; height:${sz.h*56+1}px;
            border:2px solid ${isEnemy ? 'var(--red)' : 'var(--gold)'};
            border-radius:3px; pointer-events:none;
          `;
          cell.appendChild(border);
          cell.style.overflow = 'visible';

          // Name label for 2x2+
          if (sz.w >= 2 || sz.h >= 2) {
            const lbl = document.createElement('div');
            lbl.style.cssText = `
              position:absolute; bottom:-14px; left:0; z-index:4;
              width:${sz.w*56}px; text-align:center;
              font-size:0.6em; color:${isEnemy?'var(--red)':'var(--gold)'};
              pointer-events:none; white-space:nowrap;
            `;
            lbl.textContent = data?.name || anchor.id;
            cell.appendChild(lbl);
          }

          cell.title = `${data?.name||anchor.id} [${anchor.size||'1x1'}] mv:${data?.movement||3} pos:[${r},${c}]`;

        } else if (cover) {
          // Covered by multi-cell unit (not anchor) — dim
          cell.style.opacity = '0.6';
        } else {
          // Empty — show terrain icon
          if (td.icon) cell.textContent = td.icon;
        }

        cell.onmousedown = (e) => { e.preventDefault(); _isMouseDown = true; _cellAction(r, c); };
        cell.onmouseenter = () => { if (_isMouseDown && _paintMode === 'terrain') _cellAction(r, c); };

        rowEl.appendChild(cell);
      }
      gridEl.appendChild(rowEl);
    }
    container.appendChild(gridEl);
  }

  function _cellAction(r, c) {
    if (_paintMode === 'terrain') {
      if (_unitAtCell(r, c)) return; // don't paint under units
      if (_grid[r]) _grid[r][c] = _selectedTerrain;
      _renderGrid();
    } else if (_paintMode === 'unit' && _selectedUnit) {
      if (!_canPlace(_selectedUnitSize, r, c, -1)) {
        UI().toast('Cannot place — blocked, occupied, or out of bounds', 'error', 1500);
        return;
      }
      _units.push({ id: _selectedUnit, pos: [r, c], size: _selectedUnitSize });
      _renderGrid(); _renderUnitList();
    } else if (_paintMode === 'erase_unit') {
      const u = _unitAtCell(r, c);
      if (u) {
        const idx = _units.indexOf(u);
        if (idx >= 0) _units.splice(idx, 1);
        _renderGrid(); _renderUnitList();
      }
    }
  }

  function _renderUnitList() {
    const el = _formEl.querySelector('#enc-unit-list');
    if (!el) return;
    if (!_units.length) { el.innerHTML = '<div class="dim">No units placed</div>'; return; }
    el.innerHTML = _units.map((u, i) => {
      const d = DS().get('characters', u.id) || DS().get('monsters', u.id);
      const team = d?.team || '?';
      const clr = team==='enemy'?'var(--red)':team==='player'?'var(--green)':'var(--text-dim)';
      return `<div class="effect-chip">
        <span class="chip-icon">${d?.icon||'⬤'}</span>
        <span class="chip-name">${d?.name||u.id}</span>
        <span class="chip-desc"><span style="color:${clr}">${team}</span> · [${u.pos[0]},${u.pos[1]}] · ${u.size||'1x1'} · mv:${d?.movement||3}</span>
        <button class="btn-icon" onclick="CJS.EncounterEditor._removeUnit(${i})">❌</button>
      </div>`;
    }).join('');
  }

  function _removeUnit(i) { _units.splice(i, 1); _renderGrid(); _renderUnitList(); }

  function _resizeGrid(nw, nh) {
    const old = _grid;
    _grid = [];
    for (let r = 0; r < nh; r++) {
      _grid[r] = [];
      for (let c = 0; c < nw; c++)
        _grid[r][c] = old[r]?.[c] || 'empty';
    }
    _width = nw; _height = nh;
    // Remove units whose footprint overflows
    _units = _units.filter(u => {
      const sz = C().UNIT_SIZES[u.size||'1x1']||{w:1,h:1};
      return u.pos[0]+sz.h <= nh && u.pos[1]+sz.w <= nw;
    });
  }

  function _save(id) {
    DS().replace('encounters', id, {
      id, name: _formEl.querySelector('#enc-name').value,
      width: _width, height: _height, grid: _grid, units: _units
    });
    _renderList();
    UI().toast('Encounter saved', 'success');
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh, _removeUnit });
})();
