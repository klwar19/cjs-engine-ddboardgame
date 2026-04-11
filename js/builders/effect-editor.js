// effect-editor.js
// UI: create/edit master effects with form fields.
// Reads: effect-registry.js, constants.js, ui-helpers.js, value-calc.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.EffectEditor = (() => {
  'use strict';

  const C   = () => window.CJS.CONST;
  const ER  = () => window.CJS.EffectRegistry;
  const UI  = () => window.CJS.UI;
  const VC  = () => window.CJS.ValueCalc;

  let _container = null;
  let _listEl = null;
  let _formEl = null;
  let _activeId = null;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:280px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="eff-search" placeholder="Search effects..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="eff-new">+ New</button>
          </div>
          <div class="filter-bar" id="eff-filter-bar"></div>
          <div class="data-list" id="eff-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="eff-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">
            Select an effect or create a new one
          </div>
        </div>
      </div>
    `;

    _listEl = _container.querySelector('#eff-list');
    _formEl = _container.querySelector('#eff-form-area');

    _container.querySelector('#eff-new').onclick = () => _createNew();
    _container.querySelector('#eff-search').oninput = (e) => _renderList(e.target.value);

    _buildFilterBar();
    _renderList();
  }

  let _activeFilter = 'all';

  function _buildFilterBar() {
    const bar = _container.querySelector('#eff-filter-bar');
    const all = ER().getAllEffects();
    const grouped = ER().getEffectsGroupedByCategory();
    let html = `<button class="filter-btn active" data-cat="all">All (${all.length})</button>`;
    for (const [cat, items] of Object.entries(grouped)) {
      if (items.length > 0) html += `<button class="filter-btn" data-cat="${cat}">${cat} (${items.length})</button>`;
    }
    bar.innerHTML = html;
    bar.onclick = (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeFilter = btn.dataset.cat;
      _renderList(_container.querySelector('#eff-search').value);
    };
  }

  function _renderList(query) {
    let effects = query ? ER().searchEffects(query) : ER().getAllEffects();
    if (_activeFilter !== 'all') {
      effects = effects.filter(e => e.category === _activeFilter);
    }
    UI().renderDataList({
      container: _listEl,
      items: effects,
      activeId: _activeId,
      onSelect: (eff) => _loadEffect(eff.id)
    });
  }

  function _createNew() {
    const id = ER().createEffect({ name: 'New Effect' });
    _activeId = id;
    _renderList();
    _buildFilterBar();
    _loadEffect(id);
    UI().toast('Effect created', 'success');
  }

  function _loadEffect(id) {
    _activeId = id;
    _renderList(_container.querySelector('#eff-search').value);
    const eff = ER().getEffect(id);
    if (!eff) return;
    _renderForm(eff);
  }

  function _renderForm(eff) {
    const allTriggers = [...C().EFFECT_TRIGGERS.passive, ...C().EFFECT_TRIGGERS.event];

    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${eff.icon || '✦'} ${eff.name || 'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="eff-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="eff-del">Delete</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" id="eff-name" value="${_esc(eff.name || '')}">
          </div>
          <div class="form-group" style="flex:0 0 80px">
            <label class="form-label">Icon</label>
            <input type="text" id="eff-icon" value="${_esc(eff.icon || '✦')}" style="text-align:center;font-size:1.2em">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Trigger (WHEN)</label>
            <select id="eff-trigger">
              <optgroup label="Passive">
                ${C().EFFECT_TRIGGERS.passive.map(t => `<option value="${t}" ${eff.trigger===t?'selected':''}>${t}</option>`).join('')}
              </optgroup>
              <optgroup label="Event">
                ${C().EFFECT_TRIGGERS.event.map(t => `<option value="${t}" ${eff.trigger===t?'selected':''}>${t}</option>`).join('')}
              </optgroup>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Action (WHAT)</label>
            <select id="eff-action">
              ${C().EFFECT_ACTIONS.map(a => `<option value="${a}" ${eff.action===a?'selected':''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Target (WHO)</label>
            <select id="eff-target">
              ${C().EFFECT_TARGETS.map(t => `<option value="${t}" ${eff.target===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Value</label>
            <input type="number" id="eff-value" value="${eff.value ?? 0}" style="width:100%">
          </div>
          <div class="form-group">
            <label class="form-label">Source (HOW MUCH)</label>
            <select id="eff-source">
              ${C().VALUE_SOURCES.map(s => `<option value="${s}" ${eff.source===s?'selected':''}>${s} — ${VC().describeValue(1, s)}</option>`).join('')}
              <option value="dice:" ${(eff.source||'').startsWith('dice:')?'selected':''}>dice: (custom)</option>
              <option value="stored:" ${(eff.source||'').startsWith('stored:')?'selected':''}>stored: (custom)</option>
            </select>
          </div>
        </div>

        <div id="eff-source-custom" class="form-group" style="display:${(eff.source||'').includes(':')?'block':'none'}">
          <label class="form-label">Custom Source String</label>
          <input type="text" id="eff-source-str" value="${_esc(eff.source || '')}" placeholder="e.g. dice:2d6+3 or stored:seed_damage">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Element</label>
            <select id="eff-element">
              <option value="">— None —</option>
              ${C().ELEMENTS.map(e => `<option value="${e}" ${eff.element===e?'selected':''}>${e}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Damage Type</label>
            <select id="eff-dmgtype">
              <option value="">— None —</option>
              ${C().DAMAGE_TYPES.map(d => `<option value="${d}" ${eff.damageType===d?'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Stat (for stat_mod)</label>
            <select id="eff-stat">
              <option value="">— None —</option>
              ${C().STATS.map(s => `<option value="${s}" ${eff.stat===s?'selected':''}>${s} — ${C().STAT_NAMES[s]}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">DR Type (for dr_mod)</label>
            <select id="eff-drtype">
              <option value="">— None —</option>
              ${['physical','magic','chaos','all'].map(d => `<option value="${d}" ${eff.drType===d?'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status ID (for status_apply)</label>
            <input type="text" id="eff-statusid" value="${_esc(eff.statusId || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Terrain (for terrain_create)</label>
            <select id="eff-terrain">
              <option value="">— None —</option>
              ${Object.keys(C().TERRAIN_TYPES).map(t => `<option value="${t}" ${eff.terrainType===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Duration (turns, 0=permanent)</label>
            <input type="number" id="eff-duration" value="${eff.duration ?? 0}" min="0" max="99" style="width:100%">
          </div>
          <div class="form-group">
            <label class="form-label">Max Stacks</label>
            <input type="number" id="eff-maxstacks" value="${eff.maxStacks ?? 1}" min="1" max="99" style="width:100%">
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:4px">
            <label class="form-check"><input type="checkbox" id="eff-stacks" ${eff.stacks?'checked':''}> Stackable</label>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Threshold % (for on_low_hp / execute)</label>
            <input type="number" id="eff-threshold" value="${eff.threshold ?? ''}" min="0" max="100" style="width:100%">
          </div>
          <div class="form-group">
            <label class="form-label">AoE Shape</label>
            <select id="eff-aoeshape">
              <option value="">— None —</option>
              ${['radius','line','cone','cross'].map(s => `<option value="${s}" ${eff.aoeShape===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">AoE Size</label>
            <input type="number" id="eff-aoesize" value="${eff.aoeSize ?? ''}" min="0" max="10" style="width:100%">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Conditions (one per line, use AND/OR)</label>
          <textarea id="eff-conditions" rows="2">${(eff.conditions || []).join('\n')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Cleansed By (comma-separated)</label>
          <input type="text" id="eff-cleansed" value="${(eff.cleansedBy || []).join(', ')}">
        </div>

        <div class="form-group">
          <label class="form-label">Overridable Fields (comma-separated)</label>
          <input type="text" id="eff-overridable" value="${(eff.overridable || []).join(', ')}">
        </div>

        <div class="form-group" id="eff-tags-container">
          <label class="form-label">Tags</label>
        </div>

        <div class="form-group">
          <label class="form-label">Description (leave blank for auto-generate)</label>
          <textarea id="eff-description" rows="2">${_esc(eff.description || '')}</textarea>
        </div>

        <div class="card" style="background:var(--surface2);margin-top:12px">
          <div class="dim" style="font-size:0.82rem">
            <b>Preview:</b> ${ER().autoDescribe(eff)}<br>
            <b>Category:</b> ${eff.category} | <b>ID:</b> ${eff.id}
          </div>
        </div>

        <div style="margin-top:12px">
          <button class="btn btn-success" id="eff-save">💾 Save Effect</button>
        </div>
      </div>
    `;

    // Tags widget
    const tagsContainer = _formEl.querySelector('#eff-tags-container');
    const tagWidget = UI().createTagInput({ tags: eff.tags || [] });
    tagsContainer.appendChild(tagWidget);

    // Source select → show custom field
    _formEl.querySelector('#eff-source').onchange = (e) => {
      const v = e.target.value;
      _formEl.querySelector('#eff-source-custom').style.display = v.includes(':') ? 'block' : 'none';
      if (!v.includes(':')) _formEl.querySelector('#eff-source-str').value = v;
      else _formEl.querySelector('#eff-source-str').value = v;
    };

    // Save button
    _formEl.querySelector('#eff-save').onclick = () => _save(eff.id, tagWidget);
    _formEl.querySelector('#eff-dup').onclick = () => {
      const newId = ER().duplicateEffect(eff.id);
      if (newId) {
        _activeId = newId;
        _renderList();
        _buildFilterBar();
        _loadEffect(newId);
        UI().toast('Effect duplicated', 'success');
      }
    };
    _formEl.querySelector('#eff-del').onclick = () => {
      UI().confirm(`Delete "${eff.name}"?`, () => {
        ER().deleteEffect(eff.id);
        _activeId = null;
        _renderList();
        _buildFilterBar();
        _formEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select an effect or create a new one</div>';
        UI().toast('Effect deleted', 'info');
      });
    };
  }

  function _save(id, tagWidget) {
    const f = _formEl;
    const sourceSelect = f.querySelector('#eff-source').value;
    const sourceStr = f.querySelector('#eff-source-str').value;
    const source = sourceSelect.includes(':') ? sourceStr : sourceSelect;

    const condText = f.querySelector('#eff-conditions').value.trim();
    const conditions = condText ? condText.split('\n').map(s => s.trim()).filter(Boolean) : [];

    const cleansedText = f.querySelector('#eff-cleansed').value.trim();
    const cleansedBy = cleansedText ? cleansedText.split(',').map(s => s.trim()).filter(Boolean) : [];

    const overridableText = f.querySelector('#eff-overridable').value.trim();
    const overridable = overridableText ? overridableText.split(',').map(s => s.trim()).filter(Boolean) : [];

    const changes = {
      name:        f.querySelector('#eff-name').value,
      icon:        f.querySelector('#eff-icon').value,
      trigger:     f.querySelector('#eff-trigger').value,
      action:      f.querySelector('#eff-action').value,
      target:      f.querySelector('#eff-target').value,
      value:       Number(f.querySelector('#eff-value').value) || 0,
      source,
      element:     f.querySelector('#eff-element').value || null,
      damageType:  f.querySelector('#eff-dmgtype').value || null,
      stat:        f.querySelector('#eff-stat').value || null,
      drType:      f.querySelector('#eff-drtype').value || null,
      statusId:    f.querySelector('#eff-statusid').value || null,
      terrainType: f.querySelector('#eff-terrain').value || null,
      duration:    Number(f.querySelector('#eff-duration').value) || null,
      stacks:      f.querySelector('#eff-stacks').checked,
      maxStacks:   Number(f.querySelector('#eff-maxstacks').value) || 1,
      threshold:   Number(f.querySelector('#eff-threshold').value) || null,
      aoeShape:    f.querySelector('#eff-aoeshape').value || null,
      aoeSize:     Number(f.querySelector('#eff-aoesize').value) || null,
      conditions,
      cleansedBy,
      overridable,
      tags:        tagWidget._getTags(),
      description: f.querySelector('#eff-description').value || ''
    };

    ER().updateEffect(id, changes);
    _renderList(_container.querySelector('#eff-search').value);
    _buildFilterBar();
    _loadEffect(id);
    UI().toast(`"${changes.name}" saved`, 'success');
  }

  function _esc(str) {
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function refresh() {
    if (_container) {
      _renderList(_container.querySelector('#eff-search')?.value);
      _buildFilterBar();
    }
  }

  return Object.freeze({ init, refresh });
})();
